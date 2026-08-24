from types import SimpleNamespace

from wmn.payment_gateway.providers.base import PaymentProviderError
from wmn.payment_gateway.providers.test_gateway import WMNTestGatewayProvider


def _provider(mode):
    return WMNTestGatewayProvider(SimpleNamespace(model_family=mode))


def _payload(amount=42.84):
    return {"client_reference": "INV-TEST-001", "amount": amount}


def test_approved_authorize_and_refund():
    provider = _provider("TEST_APPROVED")
    auth = provider.authorize(_payload())
    assert auth["status"] == "Approved"
    assert auth["amount"] == 42.84
    assert auth["authorization_code"] == "TESTAUTH"
    refund = provider.refund(_payload(10))
    assert refund["status"] == "Approved"
    assert refund["amount"] == 10


def test_declined_timeout_and_error():
    assert _provider("TEST_DECLINED").authorize(_payload())["status"] == "Declined"
    assert _provider("TEST_TIMEOUT").authorize(_payload())["status"] == "Timeout"
    try:
        _provider("TEST_ERROR").authorize(_payload())
    except PaymentProviderError:
        pass
    else:
        raise AssertionError("TEST_ERROR must raise PaymentProviderError")
