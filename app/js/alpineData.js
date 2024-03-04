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

    Alpine.data('chartData', () => ({
        time_range: 'daily',
        chart: undefined,
        loading: true,

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
						}
					},
					y: {
						label: {
							text: 'Subtotal (£)',
							position: 'outer-middle'
						},
                        tick: {
                            format: d3locale.format("$,.2f")
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
                document.getElementById("total").innerHTML = `${formatted_total}`;
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
            });
            this.loading = false;
        },
    }));
});

