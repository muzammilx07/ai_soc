from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MitreMapping:
    category: str
    tactic: str
    technique_id: str
    technique_name: str
    notes: str


MITRE_ATTACK_MAP: dict[str, MitreMapping] = {
    "ddos": MitreMapping(
        category="DDoS",
        tactic="Impact",
        technique_id="T1498",
        technique_name="Network Denial of Service",
        notes="Distributed traffic flooding to degrade or disrupt services.",
    ),
    "dos": MitreMapping(
        category="DoS",
        tactic="Impact",
        technique_id="T1499",
        technique_name="Endpoint Denial of Service",
        notes="Single-source resource exhaustion against an endpoint or service.",
    ),
    "bruteforce": MitreMapping(
        category="BruteForce",
        tactic="Credential Access",
        technique_id="T1110",
        technique_name="Brute Force",
        notes="Password guessing against authentication services.",
    ),
    "webattack": MitreMapping(
        category="WebAttack",
        tactic="Initial Access",
        technique_id="T1190",
        technique_name="Exploit Public-Facing Application",
        notes="Attempts against exposed web applications and services.",
    ),
    "botnet": MitreMapping(
        category="Botnet",
        tactic="Command and Control",
        technique_id="T1071",
        technique_name="Application Layer Protocol",
        notes="Compromised hosts communicating with C2 over common protocols.",
    ),
    "portscan": MitreMapping(
        category="PortScan",
        tactic="Reconnaissance",
        technique_id="T1595",
        technique_name="Active Scanning",
        notes="Scanning ports/services to identify exposed attack surface.",
    ),
    "infiltration": MitreMapping(
        category="Infiltration",
        tactic="Lateral Movement",
        technique_id="T1021",
        technique_name="Remote Services",
        notes="Unauthorized movement into internal systems via remote services.",
    ),
}


def normalize_category(category: str) -> str:
    return category.strip().lower().replace(" ", "")


def map_to_mitre(category: str) -> dict[str, str]:
    key = normalize_category(category)
    mapping = MITRE_ATTACK_MAP.get(key)

    if mapping is None:
        return {
            "category": category,
            "tactic": "Unknown",
            "technique_id": "Unknown",
            "technique_name": "Unknown",
            "notes": "No MITRE mapping found. Add a new mapping entry in MITRE_ATTACK_MAP.",
        }

    return {
        "category": mapping.category,
        "tactic": mapping.tactic,
        "technique_id": mapping.technique_id,
        "technique_name": mapping.technique_name,
        "notes": mapping.notes,
    }
