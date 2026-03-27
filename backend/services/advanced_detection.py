from __future__ import annotations

from typing import Any


SIGNATURE_LIBRARY: dict[str, dict[str, Any]] = {
    "mimikatz": {
        "category": "malware",
        "tag": "lateral-movement",
        "threat_weight": 40,
    },
    "cobaltstrike": {
        "category": "malware",
        "tag": "lateral-movement",
        "threat_weight": 40,
    },
    "phishing": {
        "category": "iam",
        "tag": "iam",
        "threat_weight": 25,
    },
    "ransomware": {
        "category": "malware",
        "tag": "malware",
        "threat_weight": 40,
    },
}

THREAT_WEIGHT_BY_TAG: dict[str, int] = {
    "malware": 40,
    "lateral-movement": 30,
    "exfiltration": 30,
    "iam": 20,
}


def _payload_text(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    for value in payload.values():
        if isinstance(value, dict):
            chunks.append(_payload_text(value))
        elif isinstance(value, list):
            chunks.extend(str(v) for v in value)
        else:
            chunks.append(str(value))
    return " ".join(chunks).lower()


def detect_signatures(payload: dict[str, Any]) -> list[dict[str, Any]]:
    text = _payload_text(payload)
    matches: list[dict[str, Any]] = []

    for signature, meta in SIGNATURE_LIBRARY.items():
        if signature in text:
            matches.append(
                {
                    "signature": signature,
                    "category": meta["category"],
                    "tag": meta["tag"],
                    "threat_weight": meta["threat_weight"],
                }
            )

    return matches


def classify_tags(attack_type: str, payload: dict[str, Any], signature_hits: list[dict[str, Any]]) -> list[str]:
    tags: set[str] = {hit["tag"] for hit in signature_hits}
    attack = attack_type.lower()
    text = _payload_text(payload)

    if any(word in attack for word in ["infiltration", "botnet", "ddos", "dos", "ransom", "malware"]):
        tags.add("malware")
    if any(word in attack for word in ["bruteforce", "portscan", "lateral", "mimikatz", "cobalt"]):
        tags.add("lateral-movement")
    if any(word in text for word in ["exfil", "download", "upload", "dropbox", "drive"]):
        tags.add("exfiltration")
    if any(word in text for word in ["oauth", "token", "iam", "password", "credential", "phishing"]):
        tags.add("iam")

    if not tags:
        tags.add("iam")

    return sorted(tags)


def calculate_severity_score(
    tags: list[str],
    is_critical_asset: bool,
    suspicious_activity: bool,
) -> dict[str, Any]:
    threat_weight = max((THREAT_WEIGHT_BY_TAG.get(tag, 10) for tag in tags), default=10)
    asset_value = 20 if is_critical_asset else 0
    behavior_score = 10 if suspicious_activity else 0

    score = max(0, min(100, threat_weight + asset_value + behavior_score))

    if score <= 30:
        severity = "low"
    elif score <= 60:
        severity = "medium"
    elif score <= 80:
        severity = "high"
    else:
        severity = "critical"

    return {
        "severity_score": score,
        "severity": severity,
        "components": {
            "threat_weight": threat_weight,
            "asset_value": asset_value,
            "behavior_score": behavior_score,
        },
    }
