
/**
 * Get a filtered list of sales pertaining to the past time period.
 * 
 * @param {String} time_period - 'daily', 'weekly' or 'monthly' time period to fetch sales for.
 * @return {Promise<Array>} - an array of condensed sales information.
 */
async function listSales(time_period) {
    time_period_queries = await getPeriodDate(time_period);
    page = 1;
    var list_options = {
        url: 'https://www.zohoapis.eu/books/v3/salesorders',
        method: "GET" ,
        url_query: [{
            key: 'organization_id',
            value: '<org-id>'
        },
        {
            key: 'customview_id',
            value: '84211004699627069'
        },
        {
            key: 'sort_column',
            value: 'created_time'
        },
        {
            key: 'page',
            value: page
        }
    ],
        connection_link_name: 'books_conn'
    };
    list_options.url_query = list_options.url_query.concat(time_period_queries);
    console.log(list_options);
    return ZFAPPS.request(list_options).then(async (response) => {
        console.log(response);
        if (response.code != 0) {
            // something went wrong invoking the books API
            console.log("something went wrong invoking the books API");
        }
        if (response.data.status_code != 200) {
            // something went wrong invoking the books API
            console.log(`books API returned ${response.data.status_code} status`);
        }
        salesorders = JSON.parse(response.data.body).salesorders;
        page_context = JSON.parse(response.data.body).page_context;
        if (!salesorders.length || salesorders.length <= 0) {
            // no data to display for this period yet
            console.log(`No data to display since ${date_from}`);
        }
        filtered_salesorders = [];
        awaiting_payment_data = [];
        sum_total = 0;
        
        extracted_data = iterateSalesordersList(salesorders);

        filtered_salesorders = filtered_salesorders.concat(extracted_data.salesorders);
        awaiting_payment_data = awaiting_payment_data.concat(extracted_data.awaiting_payment);

        if (page_context.has_more_page) {
            more_pages = true;
            while (more_pages) {
                page += 1;
                list_options.url_query = list_options.url_query.map((param) => {
                    if (param.key == 'page') {
                        return {
                            key: 'page',
                            value: page
                        };
                    }
                    return param;
                });

                await ZFAPPS.request(list_options).then(async (response) => {
                    if (response.code != 0) {
                        // something went wrong invoking the books API
                        console.log("something went wrong invoking the books API");
                        return;
                    }
                    if (response.data.status_code != 200) {
                        // something went wrong invoking the books API
                        console.log(`books API returned ${response.data.status_code} status`);
                        return;
                    }
                    salesorders = JSON.parse(response.data.body).salesorders;
                    page_context = JSON.parse(response.data.body).page_context;
                    more_pages = page_context.has_more_page;
                    if (!salesorders.length || salesorders.length <= 0) {
                        // no data to display for this period yet
                        console.log(`No data to display`);
                        return;
                    }
                    console.log(`Found ${salesorders.length} salesorders on page ${page_context.page}`);
                    extracted_data = iterateSalesordersList(salesorders);
            
                    filtered_salesorders = filtered_salesorders.concat(extracted_data.salesorders);
                    awaiting_payment_data = awaiting_payment_data.concat(extracted_data.awaiting_payment);
                });
            }
        }

        salesorder_count = filtered_salesorders.length;

        awaitingPaymentEvent = new CustomEvent("awaiting-payment-data", {"detail": awaiting_payment_data});
        window.dispatchEvent(awaitingPaymentEvent);
        final_data = {
            total: sum_total,
            orders: filtered_salesorders,
            number_sales: salesorder_count
        };
        return final_data;
    });
}
/**
 * Iterate the list of sales orders and extract the important data.
 * 
 * @param {Array} salesorders - the list of salesorders from Zoho
 * @returns {Array} - An array containing two lists: filtered salesorders and awaiting payment orders 
 */
function iterateSalesordersList(salesorders) {
    awaiting_payment_list = [];
    filtered_salesorders_list = [];

    for (let index = 0; index < salesorders.length; index++) {
        const order = salesorders[index];
        if (order.status == "draft") {
            continue;
        }
        if (order.order_sub_status == "cs_cancell") {
            continue;
        }
        if (order.order_sub_status != "") {
            // Filter out order as it has a substatus but add to awaiting payment data.
            ap_order_data = buildAPOrder(order);
            ap_order_data ? awaiting_payment_list.push(ap_order_data) : null;
            continue;
        }
        filtered_order = {
            "order_id": order.salesorder_id,
            "order_number": order.salesorder_number,
            "order_reference": order.reference_number,
            "subtotal": order.total / 1.2,
            "customer_name": order.customer_name,
            "date": order.created_time
        };

        sum_total += filtered_order.subtotal;

        filtered_salesorders_list.push(filtered_order);
    }

    return {
        salesorders: filtered_salesorders_list,
        awaiting_payment: awaiting_payment_list
    };
}

/**
 * Take in a Zoho sales order as JSON and extract the parts we want.
 * 
 * @param {Array} order - an Array of sales order data from Zoho API.
 * @returns {Array|null} - Either an array of data or null if the order is not applicable.
 */
function buildAPOrder(order) {
    order_created = moment(order.created_time);
    return {
        "order_number": order.salesorder_number,
        "subtotal": order.total / 1.2,
        "customer_name": order.customer_name,
        "date": order_created.format("Do hh:mma"),
        "salesperson": order.salesperson_name
    };
}

/**
 * Take in data and a time period string then sort the data into appropriate buckets.
 * For example, if an order created_time is at hour 13 then it goes with that bucket.
 * 
 * @param {Array} data - An array of Sales order data collated      
 * @param {String} time_range - the time period string; 'daily', 'weekly' or 'monthly'
 * @return {Array} - the bucketed data
 */
function bucketData(order_data, time_range) {
    time_series = [];
    if (time_range == 'monthly') {
        days = moment().daysInMonth();
        time_series = Array.from({length: days}, (_, i) => i + 1);
    } else if (time_range == 'prevmonth') {
        days = moment().subtract(1, 'months').daysInMonth();
        time_series = Array.from({length: days}, (_, i) => i + 1);
    } else if (time_range == 'weekly' || time_range == 'prevweek') {
        time_series = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    } else {
        time_series = [...Array(24).keys()];
    }
    time_series.splice(0,0,'label');
    buckets = ['Totals'];
    // put each order's subtotal in a bucket
    for (let index = 0; index < order_data.orders.length; index++) {
        const order = order_data.orders[index];
        created_time = moment(order.date);
        bucket_label = "";
        if (time_range == 'daily') {
            bucket_label = created_time.hour();
        } else if (time_range == 'weekly' || time_range == 'prevweek') {
            bucket_label = created_time.isoWeekday();
        } else {
            bucket_label = created_time.date();
        }
        if (!buckets[bucket_label]) {
            buckets[bucket_label] = [];
        }
        buckets[bucket_label].push(order.subtotal);
    }
    // loop through buckets and sum any which have more than one value
    for (let index = 1; index < time_series.length; index++) {
        const bucket = buckets[index];
        if (bucket) {
            sum = 0;
            for (let i = 0; i < bucket.length; i++) {
                const subtotal = bucket[i];
                sum += subtotal;
            }
            buckets[index] = sum;
        } else {
            // any which have no data, populate with 0
            buckets[index] = 0;
        }
    }
    bucketed_data = {
        labels: time_series,
        data: buckets
    };
    return bucketed_data;
}

/**
 * Get the appropriate date based on the time period value.
 * For example; if the time_period is 'weekly', return the
 * date of the previous Monday.
 * 
 * @async
 * @param {String} time_period - 'daily', 'weekly' or 'monthly' time period to fetch sales for.
 * @return {Promise<Array>} - the query parameters for the requested time period.
 */
async function getPeriodDate(time_period) {
    let query = [];
    switch (time_period) {
        case 'prevweek':
            query.push({
                key: "created_time_start",
                value: moment().startOf('isoWeek').subtract(7, 'days').format('YYYY-MM-DD HH:mm')
            });
            query.push({
                key: 'created_time_end',
                value: moment().startOf('isoWeek').subtract(1, 'days').endOf('day').format('YYYY-MM-DD HH:mm')
            });
            break;
        case 'monthly':
            query.push({
                key: 'created_time_after',
                value: moment().startOf('month').format('YYYY-MM-DD HH:mm')
            });
            break;
        case 'prevmonth':
            query.push({
                key: 'created_time_start',
                value: moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD HH:mm')
            });
            query.push({
                key: 'created_time_end',
                value: moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD HH:mm')
            });
            break;
        case 'weekly':
            query.push({
                key: 'created_time_after',
                value: moment().startOf('isoWeek').format('YYYY-MM-DD HH:mm')
            });
            break;
        default: // 'daily'
            query.push({
                key: 'created_time_after',
                value: moment().startOf('day').format('YYYY-MM-DD HH:mm')
            })
            break;
    }
    return query;
}
