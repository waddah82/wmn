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

    function inheritSourcePrototype(TargetClass, SourceClass) {
        if (typeof TargetClass !== "function" || typeof SourceClass !== "function") {
            throw new Error("WMN POS source inheritance requires valid classes");
        }

        Object.getOwnPropertyNames(SourceClass.prototype).forEach((name) => {
            if (name === "constructor") return;
            if (Object.prototype.hasOwnProperty.call(TargetClass.prototype, name)) return;
            Object.defineProperty(
                TargetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(SourceClass.prototype, name)
            );
        });
    }

    function constructFromSource(SourceClass, TargetClass, args, initialize) {
        if (typeof SourceClass !== "function" || typeof TargetClass !== "function") {
            throw new Error("WMN POS source construction requires valid classes");
        }

        const instance = Reflect.construct(SourceClass, args || [], TargetClass);
        Object.setPrototypeOf(instance, TargetClass.prototype);
        if (typeof initialize === "function") initialize(instance, args || []);
        return instance;
    }

    ns.getClass = getPOSClass;
    ns.createComponent = createPOSComponent;
    ns.inheritSourcePrototype = inheritSourcePrototype;
    ns.constructFromSource = constructFromSource;
    window.wmn_pos_get_class = getPOSClass;
    window.wmn_pos_create_component = createPOSComponent;
    window.wmn_pos_inherit_source_prototype = inheritSourcePrototype;
    window.wmn_pos_construct_from_source = constructFromSource;
})();
