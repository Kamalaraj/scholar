import json
from typing import Any

from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

ISSUER = "https://clerk.test"
AZP = "http://localhost:3000"
KID = "test-key-1"

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk(private: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    data = json.loads(RSAAlgorithm.to_jwk(private.public_key()))
    data["kid"] = kid
    return data


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
