#!/usr/bin/env python3
"""Offline structural validation only. NOT medical or coaching approval."""
from __future__ import annotations
import json
import pathlib
import sys
from datetime import date, timedelta

HERE = pathlib.Path(__file__).resolve().parent
NAMES = [
  '01_periodization_policy.json',
  '02_weekly_training_load_policy.json',
  '03_extended_session_policy.json',
  '04_workout_selection_policy.json',
  '05_volume_distribution_policy.json',
  '06_training_pace_policy.json',
  '07_intensity_policy.json',
  '08_workout_structure_policy.json',
  '09_scheduling_and_safety_policy.json',
]
REQUIRED = {
 'policy_id', 'version', 'goal_family', 'runner_eligibility', 'required_inputs',
 'training_rules', 'fallback_rules', 'safety_constraints', 'evidence_sources',
 'review_status', 'reviewer', 'test_cases',
}

def ensure(condition: bool, description: str) -> None:
    if not condition: raise AssertionError(description)

def main() -> None:
    files = {name:json.loads((HERE/name).read_text(encoding='utf-8')) for name in NAMES}
    ensure(len(files)==9,'Missing policies')
    identifiers = set()
    for name, p in files.items():
        ensure(REQUIRED <= set(p), f'{name}: missing metadata fields')
        ensure(p['version']=='0.1.0', f'{name}: version mismatch')
        ensure(p['goal_family']=='5k' and p['plan_family']=='first_5k_true_beginner_run_walk',f'{name}: goal mismatch')
        ensure(p['review_status']=='draft', f'{name}: not draft')
        ensure(not p['release_gate']['can_activate'], f'{name}: unsafe activation')
        ensure(p['reviewer']['name'] is None, f'{name}: fake reviewer')
        ensure(p['policy_id'] not in identifiers, f'{name}: duplicated policy ID')
        identifiers.add(p['policy_id'])
        ensure(len(p['test_cases'])>=2, f'{name}: missing acceptance test cases')
        ensure(bool(p['evidence_sources']), f'{name}: no sources')

    period = files[NAMES[0]]['training_rules']
    weekly = files[NAMES[1]]['training_rules']['week_by_week_budget']
    extended = files[NAMES[2]]['training_rules']['week_by_week_extended_session']
    volume = files[NAMES[4]]['training_rules']['weekly_distribution']
    sessions = files[NAMES[7]]['training_rules']['week_by_week_session_templates']
    pace = files[NAMES[5]]['training_rules']
    intensity = files[NAMES[6]]['training_rules']
    ensure(period['plan_weeks']==12,'Wrong plan length')
    ensure(len(weekly)==len(extended)==len(volume)==len(sessions)==12,'Missing week entries')
    ensure(period['recovery_weeks']==[4,8],'Unexpected recovery weeks')
    ensure(period['event_week']==12,'Unexpected event week')
    ensure(intensity['max_demanding_sessions_per_week']==0,'Beginner quality session cap breached')
    ensure(pace['gps_pace_target_seconds_per_km'] is None, 'Invented race pace')
    ensure(pace['prescribed_heart_rate_zone'] is None,'Invented HR zone')

    # Strict internal arithmetic checks against three separate policies.
    max_seen_long = None
    max_seen_week = None
    for w in range(1,13):
        idx=w-1
        ensure(weekly[idx]['week']==extended[idx]['week']==volume[idx]['week']==sessions[idx]['week']==w, f'Week index mismatch {w}')
        entries = sessions[idx]['sessions']
        ensure(set(entries)=={'A','B','C'}, f'Week {w}: expected A, B, C')
        main_total=running_total=0
        for code, step in entries.items():
            if w==12 and code=='C':
                ensure(step['type']=='walk_run_5k_event' and step['distance_meters']==5000, 'W12 must end in 5000 m event')
                ensure(step['main_movement_seconds'] is None, 'Cannot invent event duration')
                ensure(volume[idx]['session_main_seconds'][code] is None, 'Distribution invented event duration')
            else:
                ensure(step['type']=='run_walk_repeats', f'Week {w}/{code}: invalid structure')
                expected = (step['run_seconds'] + step['walk_seconds'])*step['repetitions']
                actual_running=step['run_seconds']*step['repetitions']
                ensure(step['main_movement_seconds']==expected, f'Week {w}/{code}: cycle arithmetic')
                ensure(step['actual_running_seconds']==actual_running, f'Week {w}/{code}: running arithmetic')
                ensure(volume[idx]['session_main_seconds'][code]==expected, f'Week {w}/{code}: distribution mismatch')
                ensure(volume[idx]['run_seconds'][code]==actual_running, f'Week {w}/{code}: running mismatch')
                main_total+=expected
                running_total+=actual_running
        if w<12:
            ensure(weekly[idx]['planned_main_movement_seconds']==main_total, f'W{w}: weekly budget mismatch')
            ensure(weekly[idx]['planned_running_seconds']==running_total, f'W{w}: weekly running time mismatch')
            ensure(weekly[idx]['total_training_minutes_including_event']==main_total/60+30, f'W{w}: full time mismatch')
            ensure(extended[idx]['main_movement_seconds']==entries['C']['main_movement_seconds'], f'W{w}: extended mismatch')
            if w in (4,8):
                ensure(main_total < weekly[idx-1]['planned_main_movement_seconds'], f'W{w}: not a recovery week')
            else:
                # Draft engineering checks, not evidence-based medical thresholds.
                if max_seen_week is not None and main_total > max_seen_week:
                    ensure(main_total <= max_seen_week*1.20 + 0.001, f'W{w}: >20% previous peak main movement')
                if max_seen_long is not None and entries['C']['main_movement_seconds']>max_seen_long:
                    ensure(entries['C']['main_movement_seconds']-max_seen_long<=360, f'W{w}: extended progression > 360s')
                max_seen_week=max(main_total,max_seen_week or 0)
                max_seen_long=max(entries['C']['main_movement_seconds'],max_seen_long or 0)
        else:
            ensure(weekly[idx]['planned_main_movement_seconds'] is None, 'W12: guessed total training time')
            ensure(weekly[idx]['known_pre_event_main_seconds']==main_total==2160, 'W12: preevent seconds mismatch')
            ensure(weekly[idx]['total_training_minutes_including_event'] is None, 'W12: guessed event total')
            ensure(extended[idx]['main_movement_seconds'] is None and extended[idx]['goal_distance_meters']==5000,'W12: event mismatch')

    # Explicitly reject same-day and neighboring days, including Sun->Mon across weeks.
    day_indices={'Monday':0,'Tuesday':1,'Wednesday':2,'Thursday':3,'Friday':4,'Saturday':5,'Sunday':6}
    def valid_days(days):
        points=sorted(day_indices[d] for d in days)
        return len(set(points))==3 and all(((points[(i+1)%3]-points[i])%7)>=2 for i in range(3))
    ensure(valid_days(['Tuesday','Thursday','Sunday']), 'Default schedule invalid')
    ensure(not valid_days(['Monday','Tuesday','Friday']), 'Adjacent day permitted')
    ensure(not valid_days(['Monday','Wednesday','Sunday']), 'Cross-week adjacency permitted')

    print('PASS: 9 draft policies, all required metadata, locked release gates')
    print('PASS: 12 weeks, 36 A/B/C sessions, run/walk segment arithmetic')
    print('PASS: weekly budgets, long-session limits, two reduced weeks, paced-by-effort')
    print('PASS: W12 5,000 m event with unknown duration, no invented paces')
    print('PASS: basic scheduling and week-boundary rest-day constraints')
    print('CAUTION: consistency is not clinical validation; these drafts remain blocked.')

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('FAIL:',exc, file=sys.stderr)
        raise
