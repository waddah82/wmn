        const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;
        
        
        
        class MyPastOrderSummary extends OriginalPastOrderSummary {
            constructor(options = {}, args = {}) {
                // ERPNext 15.95 PastOrderSummary constructor expects one object:
                // { wrapper, settings, events }.
                let opts = options || {};

                if (!opts.wrapper && args && args.wrapper) {
                    opts = args;
                }

                opts.settings = wmn_safe_settings(
                    opts.settings ||
                    (window.cur_pos && window.cur_pos.settings) ||
                    {}
                );

                opts.events = opts.events || {};

                super(opts);
                this.after_submission = false;
            }
            
            
            

            toggle_summary_placeholder(show) {
                if (this.after_submission === true && show === true) {
                   
                    return;
                }
                super.toggle_summary_placeholder(show);
            }

            load_summary_of(doc, after_submission = false) {
                this.after_submission = after_submission;
                super.load_summary_of(doc, after_submission);
            }

            get_condition_btn_map() {
                if (this.after_submission === true) {
                    return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
                }
                return super.get_condition_btn_map();
            }
        }

        erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;
        
