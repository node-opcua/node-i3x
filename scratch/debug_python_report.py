import json

with open('c:/sterfive/i3x-conformance-tests/python_report.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Find SUB-06 or check results
for r in data.get('results', []):
    if r['id'] == 'SUB-06':
        print(json.dumps(r, indent=2))
