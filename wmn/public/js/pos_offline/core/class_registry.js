/* WMN-owned POS class registry. Creates POS components without replacing ERPNext globals. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    if (!ns) throw new Error("WMN POS namespace is not available");

    ns.Classes = ns.Classes || {};

    function getPOSClass(name) {
        const ClassRef = ns.Classes[name];
        if (typeof ClassRef !== "function") {
            throw new Error(`WMN POS class ${name} is not available`);
        }
        return ClassRef;
    }

    function createPOSComponent(name, options) {
        const ClassRef = getPOSClass(name);
        return new ClassRef(options || {});
    }

    ns.getClass = getPOSClass;
    ns.createComponent = createPOSComponent;
    window.wmn_pos_get_class = getPOSClass;
    window.wmn_pos_create_component = createPOSComponent;
})();
