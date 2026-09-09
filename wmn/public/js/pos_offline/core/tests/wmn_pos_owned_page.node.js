const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../../../../..");
const hooks = fs.readFileSync(path.join(root, "hooks.py"), "utf8");
const pageJsonPath = path.join(root, "wmn/page/wmn_pos/wmn_pos.json");
const loader = fs.readFileSync(path.join(root, "public/js/pos_offline/wmn_pos_page_loader.js"), "utf8");
const legacyLoader = fs.readFileSync(path.join(root, "public/js/pos_offline/wmn_pos_loader.js"), "utf8");
const boot = fs.readFileSync(path.join(root, "public/js/pos_offline/core/wmn_page_boot.js"), "utf8");
const controller = fs.readFileSync(path.join(root, "public/js/pos_offline/overrides/controller/controller.methods.js"), "utf8");
const classRegistry = fs.readFileSync(path.join(root, "public/js/pos_offline/core/class_registry.js"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "public/js/pos_offline/services/data/pos_data_source.js"), "utf8");

assert.ok(fs.existsSync(pageJsonPath), "WMN POS Desk page must exist");
assert.ok(hooks.includes('"wmn-pos": "public/js/pos_offline/wmn_pos_page_loader.js"'), "WMN POS page must load its owned page loader");
assert.ok(loader.includes('frappe.pages["wmn-pos"].on_page_load'), "Owned page loader must bind /app/wmn-pos");
assert.ok(loader.includes('"core/class_registry.js"'), "Owned page loader must load the WMN class registry");
assert.ok(loader.includes('"services/data/pos_data_source.js"'), "Owned page loader must load the POS data-source boundary");
assert.ok(legacyLoader.includes('"services/data/pos_data_source.js"'), "Legacy page must share the same POS data-source boundary");
assert.ok(
  loader.indexOf("services/data/pos_data_source.js") < loader.indexOf("overrides/controller/controller.methods.js"),
  "Data-source boundary must load before Controller methods"
);
assert.ok(!loader.includes('"patches/patch_registry.js"'), "Owned page loader must not load patch registry");
assert.ok(!loader.includes("wmn_pos_boot(wrapper)"), "Owned page loader must not use replacement boot");
assert.ok(loader.includes("wmn_pos_page_boot(wrapper)"), "Owned page loader must use clean WMN page boot");
assert.ok(!boot.includes("EnabledPatches.applyAll"), "Owned page boot must not apply patches");
assert.ok(!boot.includes("pos[name] ="), "Owned page boot must not replace ERPNext POS classes");
assert.ok(boot.includes("new ns.Classes.Controller(wrapper)"), "Owned page boot must instantiate the WMN Controller directly");
assert.ok(classRegistry.includes("wmn_pos_create_component"), "Class registry must expose component creation helper");
assert.ok(!classRegistry.includes("erpnext?.PointOfSale?.[name]"), "Class registry must not fall back to ERPNext POS classes");
assert.ok(dataSource.includes("class OnlineERPNextBackend"), "Data-source boundary must define the online server backend");
assert.ok(dataSource.includes("class OfflineLocalBackend"), "Data-source boundary must define the offline local backend");
assert.ok(dataSource.includes("class LocalStorageBackend"), "Data-source boundary must be prepared for localStorage");
assert.ok(dataSource.includes("class LocalDBBackend"), "Data-source boundary must be prepared for local DB drivers");
assert.ok(dataSource.includes("registerBackend(BACKEND.LOCAL_DB"), "Local DB backend must be registered as a selectable local backend");
assert.ok(dataSource.includes("Offline POS data source has no local method"), "Offline calls must reject unmapped server methods");
assert.ok(controller.includes("this.wmn_data_source = ns.Services?.Data?.createForController"), "Controller must own a POS data source");
assert.ok(controller.includes("this.wmn_data_source?.controllerCache?.()"), "Controller cache access must go through the data source");
assert.ok(controller.includes('createPOSComponent("Payment"'), "Controller must create Payment through the WMN class registry");
assert.ok(controller.includes('createPOSComponent("ItemSelector"'), "Controller must create ItemSelector through the WMN class registry");
assert.ok(!controller.includes("new erpnext.PointOfSale.Payment"), "Controller must not instantiate ERPNext Payment directly");
assert.ok(!controller.includes("new erpnext.PointOfSale.ItemSelector"), "Controller must not instantiate ERPNext ItemSelector directly");
