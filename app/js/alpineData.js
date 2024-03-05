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

        createChart() {
            this.chart = c3.generate({
				bindto: '#chart',
				data: {
					x: 'label',
					columns: [
						['label', '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11','12','13','14','15','16','17','18','19','20','21','22','23'],
						['totals', 30, 200, 100, 400, 150, 0, 345, 324, 0, 0, 211, 0, 600, 30, 200, 100, 400, 150, 0, 345, 324, 0, 0, 211, 0, 600]
					],
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
						label: {
							text: 'Subtotal',
							position: 'outer-middle'
						},
                        tick: {
                            format: d3locale.format("$,.2f"),
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
                }
			});
            this.loading = false;
        },

        async refreshData() {
            this.loading = true;
            listSales(this.time_range).then((data) => {
                formatted_total = formatCurrencyGBP(data.total);
                this.total_string = `${formatted_total}`;
                return bucketData(data, this.time_range);
            }).then((chart_data) => {
                console.log(chart_data);
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
                this.next_update = `Next update: ${moment().add(Alpine.store('REFRESH_RATE'), 'minutes').format("HH:mm:ss")}`;
                this.loading = false;
            });
        },
    }));

    Alpine.data('awaitingPaymentChart', () => ({
        loading: true,
        total: undefined,
        top_ap_orders: undefined,

        newAwaitingPaymentData(event) {
            console.log(event);
            if (!event) { return; }
            this.loading = true;
            sum = 0;
            for (let index = 0; index < event.length; index++) {
                const order = event[index];
                sum += order.subtotal;
            }
            this.total = formatCurrencyGBP(sum);
            if (event.length < 5) {
                event.length = 5;
                Array.from(event);
            }
            this.top_ap_orders = event;
            this.loading = false;
        }
    }));
});

