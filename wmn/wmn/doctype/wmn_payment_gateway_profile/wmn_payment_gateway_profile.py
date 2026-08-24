from frappe.model.document import Document

MODEL_TRANSPORT = {
    "GEIDEA_CLOUD": "Cloud Server API",
    "GEIDEA_SOFTPOS": "SoftPOS SDK",
    "GEIDEA_SMART_POS": "ECR WebSocket Bridge",
    "GEIDEA_CARD_READER": "ECR WebSocket Bridge",
    "STC_SOFTPOS_APP": "Android App Bridge",
    "STC_SOFTPOS_SDK": "SoftPOS SDK",
    "GENERIC_ANDROID_SDK": "SoftPOS SDK",
    "GENERIC_ANDROID_APP": "Android App Bridge",
    "GENERIC_ECR_WS": "ECR WebSocket Bridge",
    "GENERIC_ECR_HTTP": "ECR HTTP Bridge",
    "GENERIC_CLOUD": "Cloud Server API",
    "STANDALONE_TERMINAL": "Standalone / Manual Reference",
}

class WMNPaymentGatewayProfile(Document):
    def validate(self):
        expected = MODEL_TRANSPORT.get(self.model_family)
        if expected:
            self.transport = expected
