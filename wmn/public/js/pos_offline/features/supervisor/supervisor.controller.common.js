/* Supervisor Common controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Supervisor = ns.Features.Supervisor || {};
    ns.Features.Supervisor.Common = ns.Features.Supervisor.Common || {};
    ns.Features.Supervisor.Common.ControllerMethods = {
        async wmn_authorize_pos_action(action, context = {}) {
                        if (!window.WMNPOSSupervisor || typeof window.WMNPOSSupervisor.authorize !== "function") {
                            return { approved: true, required: false, action };
                        }

                        return await window.WMNPOSSupervisor.authorize(action, Object.assign({
                            controller: this,
                            doc: this.frm && this.frm.doc ? this.frm.doc : null,
                            pos_profile: this.pos_profile || this.settings?.pos_profile || this.frm?.doc?.pos_profile || "",
                        }, context || {}));
                    }
    };
})();
