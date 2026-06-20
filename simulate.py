import json
import datetime
import sys

# Define target year
YEAR = 2027

# Holiday DB for 2027
HOLIDAYS_2027 = {
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
    '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15',
    '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03',
    '2027-10-04', '2027-10-09', '2027-12-25'
}

def get_holiday_name(dt):
    date_str = dt.strftime('%Y-%m-%d')
    return "Holiday" if date_str in HOLIDAYS_2027 else None

def get_monday(dt):
    # day: 0 is Monday, 6 is Sunday in Python's weekday()
    # In JS: 0 is Sunday, 1 is Monday
    # Let's map Python's weekday to match JS getMonday logic:
    # JS: diff = getDate() - day + (day === 0 ? -6 : 1)
    # Python: dt.weekday() returns 0 for Monday, 6 for Sunday
    # So if weekday is Sunday (6), we want to subtract 6 days.
    # If weekday is Monday (0), we subtract 0 days.
    # Generally: subtract dt.weekday() days.
    return dt - datetime.timedelta(days=dt.weekday())

def get_week_of_year(dt):
    start_of_year = datetime.date(dt.year, 1, 1)
    first_monday = get_monday(start_of_year)
    diff = dt - first_monday
    return (diff.days // 7) + 1

def get_monday_of_week(week_num, year=2027):
    start_of_year = datetime.date(year, 1, 1)
    first_monday = get_monday(start_of_year)
    return first_monday + datetime.timedelta(weeks=week_num - 1)

def get_adjusted_start_date(dt):
    # If it is a Monday and a holiday, adjust to Tuesday
    if dt.weekday() == 0:  # Monday
        if get_holiday_name(dt):
            return dt + datetime.timedelta(days=1)
    return dt

def generate_segment_permutations(face, online, cleanup_segs, original_non_cleanup=None):
    # Match JS logic
    permutations = []
    if original_non_cleanup:
        permutations.append(original_non_cleanup)
        
    if face > 0 and online > 0:
        # 1. [face -> online]
        permutations.append([
            {'type': 'face-to-face', 'duration': face},
            {'type': 'online', 'duration': online}
        ])
        # 2. [online -> face]
        permutations.append([
            {'type': 'online', 'duration': online},
            {'type': 'face-to-face', 'duration': face}
        ])
        # 3. face split
        for x in range(1, face):
            permutations.append([
                {'type': 'face-to-face', 'duration': x},
                {'type': 'online', 'duration': online},
                {'type': 'face-to-face', 'duration': face - x}
            ])
        # 4. online split
        for y in range(1, online):
            permutations.append([
                {'type': 'online', 'duration': y},
                {'type': 'face-to-face', 'duration': face},
                {'type': 'online', 'duration': online - y}
            ])
    else:
        if face > 0:
            permutations.append([{'type': 'face-to-face', 'duration': face}])
        elif online > 0:
            permutations.append([{'type': 'online', 'duration': online}])
            
    # deduplicate & append cleanup
    unique_perms = []
    seen = set()
    for perm in permutations:
        key = ','.join(f"{s['type']}:{s['duration']}" for s in perm)
        if key not in seen:
            seen.add(key)
            unique_perms.append(perm + cleanup_segs)
    return unique_perms

# Load user state
with open('user_state.json', 'r', encoding='utf-8') as f:
    state = json.load(f)

courses = state['courses']
rooms = state['rooms']
blocked_weeks_raw = state['blockedWeeks']
year = state['year']

# Resolve blocked weeks num
blocked_nums = []
for bw in blocked_weeks_raw:
    # Calculating first Monday offset for weekNum
    first_day = datetime.date(year, bw['month'], 1)
    # JS offset logic:
    # day = firstDay.getDay() (0=Sun, 1=Mon, ..., 6=Sat)
    # firstMondayOffset = day === 1 ? 0 : (day === 0 ? 1 : 8 - day)
    day = first_day.weekday()
    # Python weekday: 0=Mon, 6=Sun
    # JS: day=0 (Sun) -> Python: day=6
    # JS: day=1 (Mon) -> Python: day=0
    # JS: day=2 (Tue) -> Python: day=1
    # ...
    # JS: day=6 (Sat) -> Python: day=5
    js_day = (day + 1) % 7
    first_monday_offset = 0 if js_day == 1 else (1 if js_day == 0 else 8 - js_day)
    target_monday = first_day + datetime.timedelta(days=first_monday_offset + (bw['week'] - 1) * 7)
    blocked_nums.append(get_week_of_year(target_monday))

print("Blocked Weeks Nums:", blocked_nums)

# Setup occupancy maps
occupancy_map = {}
for room in rooms:
    occupancy_map[room['id']] = {w: None for w in range(1, 54)}
    for w in blocked_nums:
        occupancy_map[room['id']][w] = 'SYSTEM_BLOCK'

group_occupancy_map = {}

# Preprocess courses
processed_courses = []
for c in courses:
    segments = c.get('segments', [])
    face = sum(s['duration'] for s in segments if s['type'] == 'face-to-face')
    online = sum(s['duration'] for s in segments if s['type'] == 'online')
    cleanup = sum(s['duration'] for s in segments if s['type'] == 'cleanup')
    total = face + online + cleanup
    
    s_parts = [int(x) for x in c['startRange'].split('-')]
    s_date = datetime.date(s_parts[0], s_parts[1], s_parts[2])
    e_parts = [int(x) for x in c['endRange'].split('-')]
    e_date = datetime.date(e_parts[0], e_parts[1], e_parts[2])
    
    start_w = get_week_of_year(s_date)
    end_w = get_week_of_year(e_date)
    window = end_w - start_w - total
    
    processed_courses.append({
        'id': c['id'],
        'name': c['name'],
        'capacity': int(c['capacity']),
        'originalSegments': segments,
        'faceWeeks': face,
        'onlineWeeks': online,
        'cleanupWeeks': cleanup,
        'totalDuration': total,
        'startWeek': start_w,
        'endWeek': end_w,
        'windowSize': window,
        'autoAdjustSequence': c.get('autoAdjustSequence', True),
        'group': c.get('group', ''),
        'startRange': c['startRange'],
        'endRange': c['endRange'],
        'preferredRoomId': c.get('preferredRoomId', None)
    })

# Sort processed courses exactly like scheduler.js
processed_courses.sort(key=lambda x: (-x['capacity'], x['windowSize'], -x['totalDuration']))

print("Sorted Course Order:")
for i, c in enumerate(processed_courses):
    print(f"  {i+1}. {c['name']} (Cap: {c['capacity']}, Window: {c['windowSize']}, Duration: {c['totalDuration']})")

best_scheduled_count = -1
best_allocations = []
best_occupancy_map = None
search_steps = 0
MAX_SEARCH_STEPS = 15000
hit_max_steps = False

def backtrack(course_idx, current_scheduled_count, current_allocations):
    global best_scheduled_count, best_allocations, search_steps, hit_max_steps, best_occupancy_map
    search_steps += 1
    if search_steps > MAX_SEARCH_STEPS:
        hit_max_steps = True
        return

    # Pruning
    remaining = len(processed_courses) - course_idx
    if current_scheduled_count + remaining <= best_scheduled_count:
        return

    if course_idx == len(processed_courses):
        if current_scheduled_count > best_scheduled_count:
            best_scheduled_count = current_scheduled_count
            best_allocations = list(current_allocations)
            # Deep copy occupancy_map
            best_occupancy_map = {rid: dict(weeks) for rid, weeks in occupancy_map.items()}
        return

    course = processed_courses[course_idx]
    
    # Eligible rooms
    eligible_rooms = [r for r in rooms if r['seats'] >= course['capacity']]
    eligible_rooms.sort(key=lambda r: r['seats'])
    
    preferred_room_id = course.get('preferredRoomId')
    if preferred_room_id:
        eligible_rooms.sort(key=lambda r: 0 if r['id'] == preferred_room_id else 1)
    
    if not eligible_rooms:
        # Skip course
        current_allocations.append({'id': course['id'], 'name': course['name'], 'scheduled': False, 'failReason': 'No room fits capacity'})
        backtrack(course_idx + 1, current_scheduled_count, current_allocations)
        current_allocations.pop()
        return

    # Permutations
    cleanup_segs = [s for s in course['originalSegments'] if s['type'] == 'cleanup']
    non_cleanup = [s for s in course['originalSegments'] if s['type'] != 'cleanup']
    permutations = [course['originalSegments']]
    if course['autoAdjustSequence']:
        permutations = generate_segment_permutations(course['faceWeeks'], course['onlineWeeks'], cleanup_segs, non_cleanup)

    max_start_w = course['endWeek'] - course['totalDuration'] + 1
    
    s_parts = [int(x) for x in course['startRange'].split('-')]
    limit_start = datetime.date(s_parts[0], s_parts[1], s_parts[2])
    e_parts = [int(x) for x in course['endRange'].split('-')]
    limit_end = datetime.date(e_parts[0], e_parts[1], e_parts[2])

    # Option A: Try scheduling
    for perm in permutations:
        for w in range(course['startWeek'], max_start_w + 1):
            overall_monday = get_monday_of_week(w, year)
            start_date_obj = get_adjusted_start_date(overall_monday)
            overall_friday = overall_monday + datetime.timedelta(days=4 + (course['totalDuration'] - 1) * 7)
            
            if start_date_obj < limit_start or overall_friday > limit_end:
                continue

            # Group overlap check
            has_group_overlap = False
            grp = course['group'].strip()
            if grp:
                for check_w in range(w, w + course['totalDuration']):
                    if group_occupancy_map.get(grp, {}).get(check_w) is not None:
                        has_group_overlap = True
                        break
            if has_group_overlap:
                continue

            # Room availability check
            for room in eligible_rooms:
                is_room_available = True
                current_offset = 0
                for seg in perm:
                    seg_start = w + current_offset
                    seg_end = seg_start + seg['duration'] - 1
                    if seg['type'] == 'face-to-face':
                        for check_w in range(seg_start, seg_end + 1):
                            if occupancy_map[room['id']][check_w] is not None:
                                is_room_available = False
                                break
                    if not is_room_available:
                        break
                    current_offset += seg['duration']

                if is_room_available:
                    # Allocate
                    current_offset2 = 0
                    for seg in perm:
                        seg_start = w + current_offset2
                        seg_end = seg_start + seg['duration'] - 1
                        if seg['type'] == 'face-to-face':
                            for check_w in range(seg_start, seg_end + 1):
                                occupancy_map[room['id']][check_w] = course['id']
                        current_offset2 += seg['duration']

                    if grp:
                        if grp not in group_occupancy_map:
                            group_occupancy_map[grp] = {}
                        for check_w in range(w, w + course['totalDuration']):
                            group_occupancy_map[grp][check_w] = course['id']

                    current_allocations.append({
                        'id': course['id'],
                        'name': course['name'],
                        'scheduled': True,
                        'bestStartWeek': w,
                        'bestRoomId': room['id']
                    })

                    backtrack(course_idx + 1, current_scheduled_count + 1, current_allocations)

                    if hit_max_steps:
                        return

                    # Backtrack
                    current_allocations.pop()
                    
                    current_offset3 = 0
                    for seg in perm:
                        seg_start = w + current_offset3
                        seg_end = seg_start + seg['duration'] - 1
                        if seg['type'] == 'face-to-face':
                            for check_w in range(seg_start, seg_end + 1):
                                if occupancy_map[room['id']][check_w] == course['id']:
                                    occupancy_map[room['id']][check_w] = None
                        current_offset3 += seg['duration']

                    if grp:
                        for check_w in range(w, w + course['totalDuration']):
                            if group_occupancy_map[grp].get(check_w) == course['id']:
                                group_occupancy_map[grp][check_w] = None

    # Option B: Skip scheduling
    current_allocations.append({'id': course['id'], 'name': course['name'], 'scheduled': False, 'failReason': 'Slot conflict'})
    backtrack(course_idx + 1, current_scheduled_count, current_allocations)
    current_allocations.pop()

# Run backtrack
backtrack(0, 0, [])

print("--- OCCUPANCY MAP room-2 ---")
if best_occupancy_map:
    for w in range(1, 54):
        val = best_occupancy_map['room-2'].get(w)
        if val:
            print(f"  W{w}: {val}")

print("--- OCCUPANCY MAP room-1 ---")
if best_occupancy_map:
    for w in range(1, 54):
        val = best_occupancy_map['room-1'].get(w)
        if val:
            print(f"  W{w}: {val}")

print("--- RESULTS ---")
print(f"Scheduled count: {best_scheduled_count} / {len(processed_courses)}")
print(f"Search steps: {search_steps}")
print(f"Hit Max Steps: {hit_max_steps}")
for item in best_allocations:
    print(f"  {item['name']}: {'Scheduled in ' + item['bestRoomId'] + ' (W' + str(item['bestStartWeek']) + ')' if item['scheduled'] else 'FAILED: ' + item['failReason']}")
