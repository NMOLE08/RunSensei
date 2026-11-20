"""Research comparison metadata only; passing does not establish coaching safety."""
import json
from pathlib import Path

root = Path(__file__).parent
p = json.loads((root / '04_starting_workload_comparison_v0.1.0_draft.json').read_text())
foundation = json.loads((root / '02_multiweek_v0.2.0_draft.json').read_text())
assert p['policyId'] == 'torto.foundation.starting_workload_comparison'
assert p['version'] == '0.1.0-draft'
assert p['lifecycle'] == 'draft' and p['releaseEligibility'] == 'blocked'
assert p['researchOnly'] is True and p['productionEligible'] is False
assert p['reviewer'] is None and p['reviewDate'] is None
assert p['observationWeeks'] == 4 and p['weekStartsOn'] == 'Monday'
assert p['formulas'] == {'confirmed_report': 'S', 'observed_mean': 'floor(sum(Wi) / 4)', 'lower_reference': 'floor(min(S, Wlatest, median(W1,W2,W3,W4)))'}
assert p['foundationReference'] == f"{foundation['policy_id']}@{foundation['version']}"
assert p['classification'] == 'original_candidate_requires_qualified_review'
print('PASS: comparison formulas, exact foundation reference, draft-only metadata; no coaching approval')
