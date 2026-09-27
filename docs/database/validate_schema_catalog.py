"""Validate the Step 4 design catalog; never connects to a database."""
from pathlib import Path
import json

p = Path(__file__).with_name("schema-v1.catalog.json")
data = json.loads(p.read_text(encoding="utf-8"))
tables = data["tables"]
lookup = {t["name"]: t for t in tables}
assert len(lookup) == len(tables), "Duplicate entity names"
assert set(data["required_entities"]).issubset(lookup), "Required entity missing"
count = 0
for table in tables:
    if table["scope"] == "tenant":
        assert "organization_id" in table["field_names"]
    for fk in table["references"]:
        target = lookup[fk["target"]]
        assert len(fk["columns"]) == len(fk["target_columns"])
        assert all(c in table["field_names"] for c in fk["columns"])
        assert all(c in target["field_names"] for c in fk["target_columns"])
        assert fk["columns"][0] == fk["target_columns"][0] == "organization_id"
        assert fk["target_columns"] in target["reference_unique_keys"]
        count += 1
print(f"PASS: {len(tables)} entities, {count} composite references; design catalog only.")
print("No SQL executed. RLS and database behavior remain untested.")
