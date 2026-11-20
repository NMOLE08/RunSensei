"""Contract and immutable candidate-parameter checks; not coaching approval."""
import json
from pathlib import Path

p = json.loads((Path(__file__).parent / '02_multiweek_v0.2.0_draft.json').read_text())
assert p['policy_id'] == 'runsensei.foundation.multiweek'
assert p['version'] == '0.2.0-draft'
assert p['review_status'] == 'draft' and p['reviewer'] is None
assert p['production_eligible'] is False
assert p['weeks'] == 4
assert p['supported_frequency'] == [2, 3]
assert p['additional_running_seconds_per_session_by_week'] == [0, 60, 120, 0]
assert p['recovery_weeks'] == [4]
assert p['minimum_rest_days'] == 1
assert p['warmup_walk_seconds'] == p['cooldown_walk_seconds'] == 300
assert p['walking_recovery_seconds'] == 60
assert all(p['rules'].get(k) for k in ['entry','frequency','workload','structure','advancement','transition','health','higher_frequency'])
assert p['classification'] == 'original_candidate_requires_qualified_review'
assert p['limitations']
print('PASS: foundation v0.2.0 draft contract, locked candidate parameters, and release restrictions')
