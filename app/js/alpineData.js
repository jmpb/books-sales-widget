function formatCurrencyGBP(n) {
    f = new Intl.NumberFormat('en-EN', {style: 'currency', currency: 'GBP'}).format(n)
    return f;
}

var d3locale = d3.formatDefaultLocale({
    "decimal": ".",
    "thousands": ",",
    "grouping": [3],
    "currency": ["£", ""]
});

document.addEventListener('alpine:init', () => {

    Alpine.store('REFRESH_RATE', 15); // Refresh data every x minutes.

    Alpine.data('confirmedSalesChart', () => ({
        time_range: 'daily',
        chart: undefined,
        loading: true,
        total_string: undefined,
        last_updated: undefined,
        next_update: undefined,
        number_orders_str: 0,

        createChart() {
            this.chart = c3.generate({
				bindto: '#chart',
				data: {
					x: 'label',
					columns: [
						['label', '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11','12','13','14','15','16','17','18','19','20','21','22','23'],
						['totals', 30, 200, 100, 400, 150, 0, 345, 324, 0, 0, 211, 0, 600, 30, 200, 100, 400, 150, 0, 345, 324, 0, 0, 211, 0, 600]
					],
                    colors: {
                        totals: '#0369a1'
                    }
				},
				axis: {
					x: {
						type: 'category',
						label: {
							text: 'Time',
							position: 'outer-center'
						},
                        tick: {
                            multiline: false,
                            culling: {
                                max: 10
                            }
                        }
					},
					y: {
                        tick: {
                            format: d3locale.format("$,.0f"),
                            culling: {
                                max: 6
                            }
                        }
					}
				},
                tooltip: {
                    title: function(d) { return 'Sum total for ' + d; },
                    format: {
                        value: d3locale.format("$,.2f")
                    }
                },
                padding: {
                    left: 100,
                    top: 25
                },
                grid: {
                    y: {
                        show: true
                    }
                },
                point: {
                    r: 4
                }
			});
            this.loading = false;
        },

        async refreshData() {
            this.loading = true;
            listSales(this.time_range).then((data) => {
                formatted_total = formatCurrencyGBP(data.total);
                this.total_string = `${formatted_total}`;
                this.number_orders_str = `Calculated from ${data.number_sales} orders`;
                return bucketData(data, this.time_range);
            }).then((chart_data) => {
                // use chart API to load data
                this.chart.load({
                    x: 'label',
                    columns: [
                        chart_data.labels,
                        chart_data.data
                    ],
                    unload: true
                });
                if (this.time_range == 'daily') {
                    this.chart.axis.labels({x: 'Time'});
                } else if(this.time_range == 'weekly') {
                    this.chart.axis.labels({x: 'Day'});
                } else {
                    this.chart.axis.labels({x: 'Date'});
                }
            }).finally(()=> {
                this.last_updated = `Last updated: ${moment().format("HH:mm:ss")}`;
                this.next_update = `Next update: ${moment().add(Alpine.store('REFRESH_RATE'), 'minutes').format("HH:mm")}`;
                this.loading = false;
            });
        },
    }));

    Alpine.data('awaitingPaymentChart', () => ({
        loading: true,
        total: "£0.00",
        top_ap_orders: undefined,
        number_orders_str: 0,

        newAwaitingPaymentData(event) {
            if (!event || event.length == 0) { 
                this.top_ap_orders = null;
                this.loading = false;
                this.total = "£0.00";
                return; 
            }
            this.loading = true;
            event.sort(this._compareOrders);
            sum = 0;
            for (let index = 0; index < event.length; index++) {
                const order = event[index];
                sum += order.subtotal;
            }
            this.number_orders_str = `Calculated from ${event.length} orders`;
            this.total = formatCurrencyGBP(sum);
            this.top_ap_orders = event;
            this.loading = false;
        },

        _compareOrders(a, b) {
            if (a.subtotal < b.subtotal) {
                return 1;
            }
            if (a.subtotal > b.subtotal) {
                return -1;
            }
            return 0;
        }
    }));
});

