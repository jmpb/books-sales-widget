document.addEventListener('alpine:init', () => {

    Alpine.data('state', () => ({
        item_dels: [],
        installer_dels: [],

        items_validated: false,
        item_validation_result: {},
        installers_validated: false,
        installer_validation_result: {},
        validationProcessed: false,

        process_response: {},

        show_loading: true,
        show_create: false,
        show_forms: false,
        show_validation: false,
        show_process: false,

        observeReset() {
            this.item_dels = [];
            this.installer_dels = [];
            this.items_validated = false;
            this.item_validation_result = {}
            this.installers_validated = false;
            this.installer_validation_result = {};
            this.validationProcessed = false;
            this.process_response = {};
        },

        observeItemsValidated(result) {
            console.log("Item validation: ");
            console.log(result);
            this.item_validation_result = result;
            this.items_validated = true;
            if (this.installers_validated && !this.validationProcessed) {
                this.validationProcessed = true;
            }
        },

        observeInstallersValidated(result) {
            console.log("Installer validation: ");
            console.log(result);
            this.installer_validation_result = result;
            this.installers_validated = true;
            if (this.items_validated && !this.validationProcessed) {
                this.validationProcessed = true;
            }
        },

        observeItemDeletion(id) {
            console.log("Item with ID: " + id + " has been deleted.");
            this.item_dels.push(id);
        },

        observeInstallerDeletion(id) {
            console.log("Installer with ID: " + id + " has been deleted.");
            this.installer_dels.push(id);
        },

        updateState(state) {
            console.log("Changing to state: " + state);
            switch (state) {

                case "CREATE":
                    this.show_loading = false;
                    this.show_create = true;
                    this.show_forms = false;
                    this.show_process = false;
                    break;
                case "UPDATE":
                    resizeModal('800px').then(() => {
                        this.show_loading = false;
                        this.show_create = false;
                        this.show_forms = true;
                        this.show_process = false;
                    });
                    break;
                case "PROCESS":
                    this.show_loading = false;
                    this.show_create = false;
                    this.show_forms = false;
                    this.show_process = true;
                    break;
                default:
                    this.show_loading = true;
                    this.show_create = false;
                    this.show_forms = false;
                    this.show_process = false;
            }
        },

        validate() {
            window.dispatchEvent(new CustomEvent('run-validate'));
        },

        showValidationResults() {
            if (this.validationProcessed) {
                this.installers_validated = false;
                this.items_validated = false;
                this.validationProcessed = false;
                window.dispatchEvent(new CustomEvent('show-validation'));
                if (this.item_validation_result["pass"] && this.installer_validation_result["pass"]) {
                    // begin processing
                    this.process();
                }
            }
        },

        process() {
            // Update state from validate to process
            this.updateState('PROCESS');
            // Prepare data
            data = {
                item_deletions: this.item_dels,
                installer_deletions: this.installer_dels,
                item_records: this.item_validation_result["items"],
                installer_records: this.installer_validation_result["installers"],
                fgas_record: Alpine.store('fgasrecord')
            };

            // Clean up the data
            data.item_records.forEach((item) => {
                delete item.created_time;
                delete item.created_by_id;
                delete item.record_created_by;
                delete item.record_last_modified_by;
                delete item.total_gas;
                delete item.last_modified_time;
                delete item.last_modified_by_id;
                delete item.module_api_name;
                delete item.record_name;

                Object.keys(item).forEach((key) => {
                    if (key.includes("_formatted")) {
                        delete item[key];
                    }
                });
            });

            data.installer_records.forEach((installer) => {
                delete installer.created_time;
                delete installer.created_by_id;
                delete installer.record_created_by;
                delete installer.record_last_modified_by;
                delete installer.total_gas;
                delete installer.last_modified_time;
                delete installer.last_modified_by_id;
                delete installer.module_api_name;
                delete installer.record_name;
                
                Object.keys(installer).forEach((key) => {
                    if (key.includes("_formatted")) {
                        delete installer[key];
                    }
                });
            });

            data = JSON.parse(JSON.stringify(data));

            getSOId().then(async (resolve, reject) => {
                this.updateState(""); // Loading
                await sendInventoryUpdateWebhook(data).then((response) => {
                    // Deal with response from update.
                    console.log("Response from update webhook...");
                    if (response.code == 0) {
                        response_data = JSON.parse(response.data.body);
                        this.process_response = response_data.response;
                        Alpine.store('updateresponse', this.process_response.response);
                        console.log(this.process_response);
                        window.dispatchEvent(new CustomEvent('update-state', { detail: "PROCESS" }));
                    }
                });
            });
        },

        checkIfRecordsExist() {
            console.log("Checking if record exists...");
            getFGASRecord().then(async (record) => {
                return new Promise((resolve, reject) => {
                    console.log(record);
                    if(!record) {
                        window.dispatchEvent(new CustomEvent('update-state'));
                        console.log("No record found, creating...");
                        this.createFGASRecords().then(async () => {
                            await getFGASRecord();
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            }).then(() => {
                console.log("Saving fgas record ID");
                // store the fgas record's ID to use to fetch related records
                fgasrecord_id = Alpine.store('fgasrecord').module_record_id;
                Alpine.store('fgasrecord_id', fgasrecord_id);
                console.log(Alpine.store('fgasrecord_id'));
            }).then(() => {
                console.log("FGAS record ID: " + Alpine.store('fgasrecord_id'));
                console.log("Sending event to get records.");
                // Get related
                window.dispatchEvent(new CustomEvent('get-record')); // dispatch custom event to let FGASRecord know it can fetch now
            }).then(() => {
                // Dispatch event
                window.dispatchEvent(new CustomEvent('update-state', { detail: 'UPDATE' }));
            }).catch((error) => {
                console.log(error);
            });
        },

        async createFGASRecords() {
            console.log("Sending SO ID to create webhook in Zoho Inventory...");
            await sendInventoryCreateWebhook().then(async (response) => {
                console.log("Create FGAS record response: ");
                console.log(response);
            });
        }

    }));

    Alpine.data('FGASRecord', () => ({
        loading: true,
        record: {},

        getRecord() {
            console.log("Fetching record...");
            getFGASRecord().then((data) => {
                this.record = data;
                this.loading = false;
            });
        },

        resetFGASRecord() {
            this.record = {};
        }

    }));

    Alpine.data('FGASItems', () => ({
        loading: true,
        records: [],
        activeIndex: 0,
        activeRecord: {},
        validation: {},

        getItemRecords() {
            console.log("Fetching item records...");
            getFGASRelatedRecord("cm_fgas_item", "fgasitems").then((data) => {
                this.records = data;
                this.activeRecord = this.records[this.activeIndex];
                this.calcTotalGas();
                this.loading = false;
            });
        },

        setActiveRecord(id) {
            this.activeIndex = id;
            this.activeRecord = this.records[this.activeIndex];
            this.calcTotalGas();
        },

        addItem() {
            let newItem = {
                cf_fgas_item_id: "New item",
                cf_sku: "",
                cf_charge_g: "",
                cf_gas_type: "",
                cf_quantity: "",
                cf_notes: "",
                is_new: true
            };
            this.records.push(newItem);
            this.activeIndex = this.records.length - 1;
            this.activeRecord = this.records[this.activeIndex];
            this.calcTotalGas();
        },

        deleteItem() {
            if (confirm("Really delete FGAS record for item: " + this.activeRecord.cf_fgas_item_id + "? This cannot be undone.")) {
                window.dispatchEvent(new CustomEvent('item-del', { detail: this.activeRecord.cf_fgas_item_id }));
                this.records.splice(this.activeIndex, 1);
                this.activeIndex = 0;
                this.activeRecord = this.records[this.activeIndex];
                this.calcTotalGas();
            }
        },

        calcTotalGas() {
            if (this.activeRecord) {
                this.activeRecord.total_gas = this.activeRecord.cf_quantity * this.activeRecord.cf_charge_g;
            }
        },

        itemValidate() {
            let result = {
                "pass": false,
                "records": []
            };
            // Loop through items and validate fields
            this.records.forEach((item, index) => {
                errors = {};
                if (item.is_new && !item.cf_sku) {
                    errors["cf_sku"] = "Sku is required.";
                }
                if (!item.cf_charge_g) {
                    errors["cf_charge_g"] = "A charge is required.";
                }
                if (!item.cf_gas_type) {
                    errors["cf_gas_type"] = "A refrigerant gas is required.";
                }
                if (!item.cf_quantity) {
                    errors["cf_quantity"] = "Quantity is required.";
                }
                if (Object.keys(errors).length !== 0) {
                    result["records"][index] = errors;
                }
            });

            result["pass"] = !result["records"].length ? true : false;

            this.validation = result;

            result["items"] = this.records;

            // Dispatch event items-validation with result
            window.dispatchEvent(new CustomEvent('item-validation', { detail: result }));
        },

        showItemValidation() {
            console.log("Showing item validations");
            if (Object.keys(this.validation["records"]).length > 0) {
                for (const record_index in this.validation["records"]) {
                    errors = this.validation["records"][record_index];
                    this.records[record_index].invalid = true;
                    this.records[record_index].errors = errors;
                }
                this.setActiveRecord(Object.keys(this.validation["records"])[0]);
            } else {
                this.records.forEach((record) => {
                    record.invalid = false;
                    record.errors = undefined;
                });
                this.activeRecord.invalid = false;
                this.activeRecord.errors = undefined;
            }
        },

        resetFGASItems() {
            this.loading = true;
            this.records = [];
            this.activeIndex = 0;
            this.activeRecord = {};
            this.validation = {};
        }

    }));

    Alpine.data('FGASInstallers', () => ({
        loading: true,
        records: [],
        activeIndex: 0,
        activeRecord: {},
        validation: {},

        getInstallerRecords() {
            console.log("Fetching installer records...");
            getFGASRelatedRecord("cm_fgas_installer", "fgasinstallers").then((data) => {
                this.records = data;
                this.activeRecord = this.records[this.activeIndex];
                this.loading = false;
            });
        },

        setActiveRecord(id) {
            this.activeIndex = id;
            this.activeRecord = this.records[this.activeIndex];
        },

        addInstaller() {
            let newItem = {
                cf_installer_id: "New Installer",
                cf_installer_name: "",
                cf_fgas_number: "",
                cf_notes: "",
                is_new: true
            };
            this.records.push(newItem);
            this.activeIndex = this.records.length - 1;
            this.activeRecord = this.records[this.activeIndex];
        },

        deleteInstaller() {
            if (confirm("Really delete FGAS record for installer: " + this.activeRecord.cf_installer_name + "? This cannot be undone.")) {
                window.dispatchEvent(new CustomEvent('installer-del', { detail: this.activeRecord.cf_installer_id }));
                this.records.splice(this.activeIndex, 1);
                this.activeIndex = 0;
                this.activeRecord = this.records[this.activeIndex];
            }
        },

        installerValidate() {
            let result = {
                "pass": false,
                "records": []
            };

            this.records.forEach((installer, index) => {
                errors = {};
                if (!installer.cf_installer_name) {
                    errors["cf_installer_name"] = "Installer Name is required.";
                }
                if (!installer.cf_fgas_number) {
                    errors["cf_fgas_number"] = "FGAS Number is required.";
                }
                if (Object.keys(errors).length !== 0) {
                    result["records"][index] = errors;
                }
            });

            result["pass"] = !result["records"].length ? true : false;

            this.validation = result;

            result["installers"] = this.records;

            // Dispatch event items-validation with: Result { pass: bool, errors: [] }
            window.dispatchEvent(new CustomEvent('installer-validation', { detail: result }));
        },

        showInstallerValidation() {
            console.log("Showing installer validations");
            if (Object.keys(this.validation["records"]).length > 0) {
                for (const record_index in this.validation["records"]) {
                    errors = this.validation["records"][record_index];
                    this.records[record_index].invalid = true;
                    this.records[record_index].errors = errors;
                }
                this.setActiveRecord(Object.keys(this.validation["records"])[0]);
            } else {
                this.records.forEach((record) => {
                    record.invalid = false;
                    record.errors = undefined;
                });
                if (this.activeRecord) {
                    this.activeRecord.invalid = false;
                    this.activeRecord.errors = undefined;
                }
            }
        },

        resetFGASInstallers() {
            this.loading = true;
            this.records = [];
            this.activeIndex = 0;
            this.activeRecord = {};
            this.validation = {};
        }
    }));
});