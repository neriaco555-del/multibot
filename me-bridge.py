#!/usr/bin/env python3
"""גשר Me לבוט הוואטסאפ — CLI שמחזיר JSON בשורה אחת.
שימוש: python3 me-bridge.py <cmd> [args...]
פקודות: auth <phone> <code> | status | search <phone> | profile <uuid>
         unsaved | saved_count | deleted | watched | tags | friendship <phone>
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CFG_DEFAULT = os.path.join(BASE, 'me-config.json')
SESS_DIR = os.path.join(BASE, 'me-sessions')


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, default=str))
    sys.stdout.flush()


def parse_session_argv():
    """שולף --session <phone> מהארגומנטים. מחזיר (args, session_digits)."""
    args = list(sys.argv[1:])
    sess = ''
    if '--session' in args:
        i = args.index('--session')
        if i + 1 < len(args):
            sess = ''.join(ch for ch in args[i + 1] if ch.isdigit())
        del args[i:i + 2]
    return args, sess


def cfg_for(sess):
    if sess:
        try:
            os.makedirs(SESS_DIR, exist_ok=True)
        except Exception:
            pass
        return os.path.join(SESS_DIR, sess + '.json')
    return ''


def saved_phone(cfg):
    try:
        with open(cfg, encoding='utf-8') as f:
            data = json.load(f) or {}
        for k in data.keys():
            if str(k).strip().isdigit():
                return str(k).strip()
    except Exception:
        pass
    return ''


def get_client(cfg):
    from meapi import Me
    ph = saved_phone(cfg)
    if not ph:
        raise Exception('NO_SAVED_SESSION')
    return Me(phone_number=ph, config_file=cfg)


def full_name(d):
    if not isinstance(d, dict):
        return ''
    if d.get('name'):
        return str(d['name']).strip()
    return (str(d.get('first_name') or '') + ' ' + str(d.get('last_name') or '')).strip()


def slim_contact(c, tag=''):
    if not isinstance(c, dict):
        return {}
    u = c.get('user') if isinstance(c.get('user'), dict) else {}
    phone = u.get('phone_number') or c.get('phone_number') or ''
    try:
        phone = str(int(phone)) if phone else ''
    except Exception:
        phone = str(phone or '').strip()
    return {
        'name': full_name(u) or full_name(c),
        'phone_number': phone,
        'country_code': c.get('country_code') or u.get('country_code') or '',
        'uuid': u.get('uuid') or c.get('uuid') or '',
        'profile_picture': u.get('profile_picture') or c.get('profile_picture') or '',
        'in_contact_list': bool(c.get('in_contact_list')),
        'tag': tag,
    }


def groups_data(me):
    try:
        g = me.get_groups_names()
    except TypeError:
        g = me.get_groups_names
    if callable(g):
        try:
            g = g()
        except Exception:
            return []
    if isinstance(g, dict):
        return g.get('groups') or g.get('names') or []
    return []


def main():
    args, sess = parse_session_argv()
    if not args:
        return out({'ok': False, 'error': 'no command'})
    # תאימות לאחור: auth בלי --session עובד לפי המספר עצמו
    cmd = args[0]
    rest = args[1:]
    try:
        if cmd == 'auth':
            from meapi import Me
            phone, code = rest[0], rest[1]
            digits = ''.join(ch for ch in str(phone) if ch.isdigit())
            cfg = cfg_for(digits)
            try:
                try:
                    me = Me(phone_number=phone, activation_code=code, config_file=cfg)
                except TypeError:
                    me = Me(phone_number=int(phone), activation_code=str(code), config_file=cfg)
            except Exception as e:
                try:
                    os.remove(cfg)
                except Exception:
                    pass
                return out({'ok': False, 'error': f'{type(e).__name__}: {str(e)[:150]}'})
            # אימות אמיתי — לא מספיק שהאובייקט נוצר, חייבים קריאה שעובדת + טוקן שמור
            try:
                prof = me.get_profile_info()
                name = full_name(prof if isinstance(prof, dict) else {})
                if not saved_phone(cfg):
                    raise Exception('NOT_SAVED')
            except Exception as e:
                try:
                    os.remove(cfg)
                except Exception:
                    pass
                return out({'ok': False, 'error': f'{type(e).__name__}: {str(e)[:150]}'})
            return out({'ok': True, 'name': name or ''})
        cfg = cfg_for(sess)
        if not cfg:
            return out({'ok': False, 'error': 'NO_SESSION'})
        me = get_client(cfg)
        if cmd == 'status':
            try:
                prof = me.get_profile_info()
                name = full_name(prof if isinstance(prof, dict) else {})
                return out({'ok': True, 'name': name or ''})
            except Exception as e:
                return out({'ok': False, 'error': f'{type(e).__name__}'})
        if cmd == 'search':
            r = me.phone_search(rest[0])
            if not r:
                return out({'ok': True, 'found': False})
            c = r if isinstance(r, dict) else {}
            user = (c.get('contact') or {}).get('user') if 'contact' in c else {}
            contact = c.get('contact', c)
            return out({'ok': True, 'found': True,
                        'name': contact.get('name', ''),
                        'uuid': (user or {}).get('uuid', ''),
                        'is_spam': contact.get('is_spam', False),
                        'raw': slim_contact(contact)})
        if cmd == 'profile':
            p = me.get_profile_info(rest[0])
            p = p if isinstance(p, dict) else {}
            return out({'ok': True, 'profile': {k: p.get(k) for k in (
                'name', 'email', 'profile_picture', 'gender', 'date_of_birth',
                'slogan', 'location_name', 'is_verified', 'carrier') if k in p}})
        if cmd == 'unsaved':
            out_list = []
            for grp in groups_data(me):
                tag = grp.get('name', '')
                for c in (grp.get('contacts') or []):
                    if not (c.get('in_contact_list')):
                        out_list.append(slim_contact(c, tag))
            return out({'ok': True, 'contacts': out_list})
        if cmd == 'saved_count':
            n = 0
            for grp in groups_data(me):
                for c in (grp.get('contacts') or []):
                    if c.get('in_contact_list'):
                        n += 1
            return out({'ok': True, 'count': n})
        if cmd == 'deleted':
            lst = me.who_deleted() or []
            return out({'ok': True, 'contacts': [slim_contact(c) for c in lst]})
        if cmd == 'watched':
            lst = me.who_watched() or []
            return out({'ok': True, 'contacts': [slim_contact(c) for c in lst]})
        if cmd == 'tags':
            groups = []
            for grp in groups_data(me):
                groups.append({'name': grp.get('name', ''),
                               'count': grp.get('count', len(grp.get('contacts') or []))})
            groups.sort(key=lambda x: -((x['count'] or 0)))
            return out({'ok': True, 'groups': groups[:30], 'total': len(groups)})
        if cmd == 'friendship':
            f = me.friendship(rest[0])
            f = f if isinstance(f, dict) else {}
            return out({'ok': True, 'friendship': {k: f.get(k) for k in (
                'he_named', 'i_named', 'mutual_contacts_count', 'calls_count',
                'calls_duration', 'watches_count', 'is_mutual') if k in f}})
        return out({'ok': False, 'error': 'unknown command'})
    except Exception as e:
        return out({'ok': False, 'error': f'{type(e).__name__}: {str(e)[:200]}'})


if __name__ == '__main__':
    main()
