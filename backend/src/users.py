#!/usr/bin/env python3
# vim: fdm=syntax:ai:si:smarttab:softtabstop=4:sw=4
""" User Management Tool for meffis-lock
    Can be used as an interactive tool, when invoked with no commandline
    parameters, or as a batch tool, when exactly 1 command is given.
"""

# TODO Ablauf incl. Uhrzeit erlauben - würde häufigeren CRON Job
#      erfordern: minütlich, stündlich?
# TODO Startdatum für Zugang


# flake8: noqa
# pylint: disable=line-too-long, unused-argument, broad-exception-caught, C


from abc import ABC, abstractmethod
from pathlib import Path
from time import time
from datetime import date, datetime, timedelta
from getpass import getpass
from functools import lru_cache
import sys
import subprocess
import readline
import json
import re
from random import randbytes
from hashlib import pbkdf2_hmac
from base64 import b64encode
import smtplib
from email.message import EmailMessage


HOME_DIR = Path.home() / 'meffis-lock' / 'backend'

DOORS = {'1': '', '2': '-einheit2', 'w': '-werkstatt'}

PWD_ITERATIONS = 10000
PWD_SALTLENGTH = 128

RE_LIFETIME_RULE = r"^(\+?)(\d+)d$"


def users_file(door):
    """ Return filename of users file for given door
    """
    return f"users{DOORS[door]}.json"


def log_file(door):
    """ Return filename of log file for given door
    """
    return f"log{DOORS[door]}.txt"


def guess_date_from_timestamp(time_stamp):
    """ The timestamps we receive from JS have untypical µs resolution.
        Try ms, then µs to return a sensible date.
    """
    stamp_date = date.fromtimestamp(time_stamp / 1000)
    if stamp_date.year < 2000:
        return date.fromtimestamp(time_stamp)
    return date.fromtimestamp(time_stamp / 1000)


class Users(ABC):
    """ Base of user collections.
        Unlike the JS counterpart this combines all users into
        one dictionary with a list of accessible doors.
        Expired users are kept in a 2nd dict of same structure.
    """
    def __init__(self, lifetimes):
        self._users = {}
        self.lifetimes = lifetimes
        self.load_from_file()
        self.modified = False

    @abstractmethod
    def load_from_file(self):
        """ Add users from file(s), ABSTRACT
        """

    @abstractmethod
    def write_to_file(self):
        """ Write users to file(s)
        """

    def exists(self, user: str):
        """ check existance of given name, case sensitive!
            returns bool for unique match
        """
        # return user.lower() in [n.lower() for n in self.user_keys()]
        return user in self.user_keys()

    def exists_fuzzy(self, joker: str):
        """ check existance of given shortname, case sensitive!
            returns list of matching full names, possibly empty
        """
        return [exact for exact in self._users if joker in exact]

    def user_keys(self):
        """ Return names (keys) of all known users
        """
        return self._users

    def user_data(self, user):
        """ Return a copy of requested user's data, if any
        """
        return self._users.get(user, None).copy()

    def doors(self, user):
        """ Return a set of doors the user may access.
        """
        if user in self._users:
            return self._users[user].get('doors', {})
        return {}

    def add_user(self, user, data):
        """ Add or replace a single user's data.
            Access to doors must be added explicitly!
        """
        self._users[user] = data
        self._users[user]['doors'] = set()
        self.modified = True

    def remove_user(self, user):
        """ Remove all access of user
        """
        self._users.pop(user, None)
        self.modified = True

    def add_door(self, user, door):
        """ Add a specific door to user
        """
        if self.exists(user):
            self._users[user]['doors'] = self._users[user]['doors'].union(door)
            self.modified = True

    def remove_door(self, user, door):
        """ Remove a single door from user's access.
            This may remove a user completely, if no door left.
        """
        if self.exists(user):
            self._users[user]['doors'] = \
              self._users[user]['doors'].difference(door)
            if not self._users[user]['doors']:
                self.remove_user(user)
            self.modified = True

    def move_user_door_to(self, user, door, dest_list):
        """ move a user's door access to another list, this may
            be users->expired or vice versa
        """
        if self.exists(user):
            if not dest_list.exists(user):
                data = self.user_data(user)
                data.update(modified=int(time()))
                dest_list.add_user(user, data)
            if door in self.doors(user):
                dest_list.add_door(user, door)
                self.remove_door(user, door)
            self.modified = True

    @lru_cache(500)
    def last_login(self, user):
        """ return latest date of any user action found in lock logs or None
        """
        latest = guess_date_from_timestamp(self._users[user].get('modified', 0))
        for door in self.doors(user):
            cmdline = ['grep', user, HOME_DIR / log_file(door)]
            # pylint: disable=subprocess-run-check
            res = subprocess.run(cmdline, stdout=subprocess.PIPE)
            if res.stdout:
                out = res.stdout.decode('utf-8').splitlines()
                last = datetime.strptime(out[-1].split()[0], '%d/%m/%Y').date()
                if not latest or last > latest:
                    latest = last
        return latest

    def last_modified(self, user):
        """ Return the date user was last modified/created.
        """
        if self.exists(user):
            return guess_date_from_timestamp(self._users[user].get('modified', 0))
        return None

    def has_access(self, user, door):
        """ Has requested user access to the door?
            Access may be expired or not existant.
        """
        return door in self.doors(user) and not self.is_expired(user, door)

    def is_expired(self, user, door):
        """ Is requested user's access to door expired?
            Only True if user has an expired entry for requested door.
        """
        if door not in self.doors(user):
            return False
        exp = self.lifetimes.expiration(user, door)
        if exp == '*':
            return False

        death = date.fromtimestamp(0)
        try:
            death = date.fromisoformat(exp)
        except (ValueError, OverflowError):
            try:
                death = date.fromtimestamp(int(exp))
            except (ValueError, OverflowError):
                m_dur = re.search(RE_LIFETIME_RULE, exp)
                if m_dur:
                    dur = int(m_dur.group(2))
                    if m_dur.group(1) == '+':
                        try:
                            death = self.last_login(user) + timedelta(days=dur)
                        except TypeError:
                            pass  # user never logged in -> expired!
                    else:
                        death = self.last_modified(user) + timedelta(days=dur)
        return date.today() > death


class ActiveUsers(Users):
    """ Active users are kept in 3 files, to keep compatibility with
        existing JS code
    """
    def load_from_file(self):
        """ Add users from the 3 door's files
        """
        # old-style: each door in a separate file
        for door in DOORS:
            fname = HOME_DIR / users_file(door)
            if Path.exists(fname):
                with open(fname, encoding='utf8') as uf:
                    usr_arr = json.load(uf)

                for data in usr_arr:
                    user = data['name']
                    data.pop('name', None)
                    if not self.exists(user):
                        self.add_user(user, data)
                    if door:
                        self.add_door(user, door)
        self.modified = True

    def write_to_file(self):
        """ Write users to file for a specific door (the current per-door
            files), or all in one (for expired.json) - similar to in-mem
            structure.
        """
        for door in DOORS:
            fname = HOME_DIR / users_file(door)
            with open(fname, encoding='utf8', mode='w') as uf:
                usr_arr = []
                for usr in self._users.keys():
                    if door in self.doors(usr):
                        # add property 'name' to each, remove 'doors'
                        usr_arr.append(self._users[usr].copy())
                        usr_arr[len(usr_arr) - 1].update(name=usr)
                        del usr_arr[len(usr_arr) - 1]['doors']
                json.dump(usr_arr, uf, indent=4, sort_keys=True)
        self.modified = False

    def user_state(self, name):
        """ return a printable line with user's state
        """
        ret = ''
        if self.exists(name):
            ret = f" {name: <40}  "
            for door in DOORS:
                if self.has_access(name, door):
                    ret += f"{door} OK   "
                elif self.is_expired(name, door):
                    ret += f"{door} exp  "
                else:
                    ret += "       "
            ret += f"  mod {self.last_modified(name)}  log {self.last_login(name)}"
        return ret


class ExpiredUsers(Users):
    """ Expired users are kept in 1 file, similar structure as in-mem.
    """
    def load_from_file(self):
        """ Add users from file
        """
        fname = HOME_DIR / 'expired.json'
        if Path.exists(fname):
            with open(fname, encoding='utf8') as uf:
                usr_arr = json.load(uf)
            for user in usr_arr:
                if not self.exists(user):
                    door_str = usr_arr[user]['doors']
                    self.add_user(user, usr_arr[user])
                    for dr in door_str:
                        self.add_door(user, dr)
        self.modified = True

    def write_to_file(self):
        """ Write users to one file (expired.json).
        """
        fname = HOME_DIR / 'expired.json'
        with open(fname, encoding='utf8', mode='w') as uf:
            usr_arr = {}
            for usr in self._users.keys():
                # convert set 'doors' to a str
                usr_arr[usr] = self._users[usr].copy()
                usr_arr[usr]['doors'] = ''
                for door in self.doors(usr):
                    usr_arr[usr]['doors'] += door
            json.dump(usr_arr, uf, indent=4, sort_keys=True)
        self.modified = False

    def user_state(self, name):
        """ return a printable line with user's state
        """
        ret = ''
        if self.exists(name):
            ret = f" {name: <40}  "
            for door in DOORS:
                if self.has_access(name, door):
                    ret += f"{door} OK   "
                elif self.is_expired(name, door):
                    ret += f"{door} exp  "
                else:
                    ret += "       "
            ret += f"  mod {self.last_modified(name)}"
        return ret


class Lifetimes:
    """ Definition of lifetimes indexed by user name.
        Each definition can be a single lifetime or a
        dict of lifetimes indexed by room.
        The later is not exposed at cmd level!

        Magic user name '-default-' is ... you guess it!

        A lifetime is specified as one of
        - duration in days relative to user's modified date:  "30d"
        - duration in days relative to last lock operation:  "+10d"
        - absolute ISO date:  "2023-12-06"
        - absolute POSIX timestamp:
        - infinite:  "*"
    """
    def __init__(self):
        self.read_from_file()
        self.modified = False

    def read_from_file(self, fname=HOME_DIR / 'lifetimes.json'):
        """ Read lifetimes from fname
        """
        self._specs = {}
        if Path.exists(fname):
            with open(fname, encoding='utf8') as lfile:
                self._specs = json.load(lfile)
        self._specs.setdefault('-default-', '30d')
        self.modified = False

    def write_to_file(self, fname=HOME_DIR / 'lifetimes.json'):
        """ write all lifetimes to fname
        """
        with open(fname, encoding='utf8', mode='w') as lfile:
            json.dump(self._specs, fp=lfile, indent=2, sort_keys=True)
        self.modified = False

    def exists(self, user):
        """ check existance of given name
        """
        # return user.lower() in [n.lower() for n in self.user_keys()]
        return user in self.user_keys()

    def user_keys(self):
        """ Return all user names with explicit lifetimes.
        """
        return self._specs.keys()

    def expiration(self, user, door):
        """ Return the expiration of door for user.
        """
        exp = self._specs.get(user, self._specs.get("-default-"))
        if not isinstance(exp, dict):
            return exp
        return exp.get(door, None)

    def add_user(self, user, exp):
        """ Add or redefine user's expiration for all doors.
            addUserDoor() can be used to have door specific expires.
        """
        self._specs[user] = exp
        self.modified = True

    def remove_user(self, user):
        """ Reset user's lifetime to default
        """
        self._specs.pop(user, None)
        self.modified = True


# ===== helper funcs =====


def get_cmd(token):
    """ find 1st matching command, or return None
    """
    for command in commands:
        if command[:len(token[0])] == token[0].lower():
            return commands[command]
    return None


def find_shortname(shortname, user_set, get_name) -> bool:
    """ resolve ambiguity of shortname, by repeatedly asking until we have
        a single result
        returns resolved name, or None
    """
    while True:
        matches = user_set.exists_fuzzy(shortname)
        if not matches:
            return None

        if len(matches) == 1:
            return matches[0]

        # pylint: disable-next=possibly-used-before-assignment
        if batchmode:
            print("      The shortname has {len(matches)} matches.  Aborting.",
                  file=sys.stderr)
            return None

        print(f"    Enter more characters as the shortname matched {len(matches)} users.")
        if len(matches) < 10:
            lst = [f"#{matches.index(m) + 1} {m}" for m in matches]
            print(f"\n>> {', '.join(lst)} <<\n")
            print(f"You can enter '#n' to select the n-th match, e.g. #2 for the 2nd name")

        shortname = get_name()
        if shortname[0] == '#':
            if not shortname in [l[0:2] for l in lst]:
                print("      This is no valid selection for above list.  Ignoring.",
                      file=sys.stderr)
                return None

            idx = int(shortname[1:]) - 1
            return matches[idx]


def encode_password(passwd):
    """ encode a password same way as the JS code would
        returns dictionary with salt and hash
    """
    pswd = bytes(passwd, 'utf-8')
    salt = b64encode(randbytes(PWD_SALTLENGTH))
    hashed = pbkdf2_hmac('sha512', pswd, salt, PWD_ITERATIONS, PWD_SALTLENGTH)
    hashed = b64encode(hashed)
    return {'salt': str(salt, 'utf-8'), 'hash': str(hashed, 'utf-8')}


def send_mail(subject, body, receiver=None):
    """ send a mail to the lock admin as defined
        in email_cfg.json. Receiver 'to' may be overruled.
    """
    fname = HOME_DIR / 'email_cfg.json'
    config = {}
    if Path.exists(fname):
        with open(fname, encoding='utf8') as cf:
            config = json.load(cf)

    if config and config['server']:
        msg = EmailMessage()
        msg.set_content(body)
        msg['Subject'] = subject
        msg['From'] = config['from']
        msg['To'] = receiver if receiver else config['to']

        try:
            with smtplib.SMTP(config['server']) as smtp:
                # smtp.set_debuglevel(1)
                smtp.starttls()
                smtp.login(config['login'], config['pwd'])
                smtp.send_message(msg)
        # pylint: disable=broad-exception-caught
        except Exception as ex:
            print('OOPS, we have a failure. Please send following output to\n'
                  'markus.kuhn@meffis.org for analysis. No email was sent.\n'
                  + str(ex),
                  file=sys.stderr)

# ===== command handlers =====


def cmd_list(parms):
    """ list all users
    parms[0] = invoking cmd
    parms[1] = filter (regEx) to match each printed line, optional
    """

    joker = r'.+'
    matching = ''
    if len(parms) > 1:
        joker = parms[1]
        matching = ', matching "' + joker + '"'

    print(f'=== active users{matching} ===')
    had_one = False
    # pylint: disable-next=possibly-used-before-assignment
    for name in sorted(users.user_keys()):
        ln = users.user_state(name)
        if re.search(joker, ln):
            had_one = True
            print(ln)
    if not had_one:
        print(' -none-')

    print(f'=== expired users{matching} ===')
    had_one = False
    # pylint: disable-next=possibly-used-before-assignment
    for name in sorted(expired.user_keys()):
        ln = expired.user_state(name)
        if re.search(joker, ln):
            had_one = True
            print(ln)
    if not had_one:
        print(' -none-')

    print(f'=== lifetimes{matching} ===')
    # pylint: disable-next=possibly-used-before-assignment
    for name in sorted(lt.user_keys()):
        expire = lt.expiration(name, users.doors(name))
        ln = f' {name: <30}: {expire}'
        if re.search(joker, ln):
            print(ln)
    return True


def cmd_new(parms):
    """ create a new user
    parms[0] = invoking cmd
    parms[1] = user name, optional
    parms[2] = door letters or '*', optional
    """
    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = input("  Enter new user name: ")
        if not nm:
            print("    No name given!  Aborting.", file=sys.stderr)
            return True

    if ' ' in nm:
        nm = nm.replace(' ', '_')
        print(f"    CAUTION, whitespace has been replaced by '_'\7: {nm}")

    if users.exists(nm):
        print("    This name does exist!  Aborting.", file=sys.stderr)
        return True
    if expired.exists(nm):
        print("    This name exists as expired user! Try to 'revive'.  Aborting.",
              file=sys.stderr)
        return True

    if len(parms) > 2:
        dr = parms[2]
    else:
        dr = input("  Enter combination of doors (1/2/w/*): ")

    # remove all invalid letters
    if '*' in dr:
        dr = '*'
    else:
        dr = [d for d in dr if d.lower() in DOORS.keys()]
    if not dr:
        print("    Please enter at least one valid door!  Aborting.", file=sys.stderr)
        return True

    print(f"    Creating account for '{nm}' with access to doors {dr}")

    # if len(parm) > 3:
    #     pw =  #TODO read from file, to not expose it in shell log
    # else:
    pw = getpass(prompt="  Enter new user's password: ")
    pw2 = getpass(prompt="  Repeat same password: ")
    if not pw == pw2:
        print("    The passwords do not match!  Aborting.", file=sys.stderr)
        return True

    data = encode_password(pw)
    data.update(name=nm, modified=int(time()))
    users.add_user(nm, data)
    users.add_door(nm, dr)
    return True


def cmd_delete(parms):
    """ delete a user completely
    parms[0] = invoking cmd
    parms[1] = shortname, optional
    """
    def get_name():
        return input("  Enter a shortname to match one user: ")

    if len(parms) > 1:
        s_nm = parms[1]
    else:
        s_nm = get_name()

    nm = find_shortname(s_nm, users, get_name)
    if not nm:
        print("    No match in active users, let's retry in expired.")
        nm = find_shortname(s_nm, expired, get_name)

    if not nm:
        print("      Name was not found in active nor expired users.  Ignoring.",
              file=sys.stderr)
        return True

    if users.exists(nm):
        users.remove_user(nm)
        print(f"      Deleting active user {nm}.")
    if expired.exists(nm):
        expired.remove_user(nm)
        print(f"      Deleting expired user {nm}.")

    if lt.exists(nm):
        lt.remove_user(nm)
        print(f"      Deleting lifetime rule for user {nm}.")

    return True


def cmd_expire(parms):
    """ add or change a user's lifetime rule
    parms[0] = invoking cmd
    parms[1] = shortname, optional
    parms[2] = lifetime, optional, this can be one of
      - absolute ISO date:  "2023-12-06"
      - absolute POSIX timestamp:  1713637154  (= 2024-04-20T20:xx)
      - duration in days relative to user's modified date:  "30d"
      - duration in days relative to last lock operation:  "+10d"
      - infinite:  "*"
    """
    def get_name():
        return input("  Enter a shortname to match one user: ")

    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = get_name()

    nm = find_shortname(nm, users, get_name)
    if not nm:
        print("      Name was not found in active users. Create user first!  Ignoring.",
              file=sys.stderr)
        return True

    if len(parms) > 2:
        rl = parms[2]
    else:
        print("    Lifetime must be specified as")
        print("    - duration in days relative to user''s modified date:  '30d'")
        print("    - duration in days relative to last lock operation:    '+10d'")
        print("    - absolute ISO date:        '2024-05-01'")
        print("    - absolute POSIX timestamp: '1713640324' (= 2024-04-20T21:12:04+02:00)")
        print("    - infinite:                 '*'  Use rarely!")
        print("    Empty input will clear user's rule if one exists.")

        rl = input("  Enter lifetime [see above]: ")

    if rl:
        lt.add_user(nm, rl)
        print(f"      Creating lifetime rule for user {nm}.")
        for door in DOORS:
            if users.is_expired(nm, door):
                print("    \7WARNING: lifetime formatted incorrectly, or resulting date is in the past!",
                      file=sys.stderr)
    else:
        if lt.exists(nm):
            lt.remove_user(nm)
            print(f"      Deleting lifetime rule for user {nm}.")
        else:
            print(f"      \7WARNING: user {nm} has no explicit rule, cannot clear it.",
                  file=sys.stderr)

    return True


def cmd_check(parms):
    """ check expiration for each active user, usually runs as a cron job
    parms[0] = invoking cmd
    """

    zombies = set()
    # check expiration of ALL active users - usually triggered as cron job
    for name in sorted(users.user_keys()):
        z_doors = ''
        for door in sorted(users.doors(name)):
            exp = users.is_expired(name, door)
            if exp:
                users.move_user_door_to(name, door, expired)
                z_doors += door
        if z_doors:
            print(f"  Expiring user {name} - door(s) {z_doors}")
            zombies.add(f"{name} - door(s) {z_doors}")

    if zombies:
        send_mail("List of latest expired lock users",
                  "Following users lost access to the listed door(s):\n"
                  + '\n'.join(zombies))
    return True


def cmd_kill(parms):
    """ disable the given user, if he/she's active
    parms[0] = invoking cmd
    parms[1] = shortname, optional
    """
    def get_name():
        return input("  Enter a shortname to match one user: ")

    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = get_name()

    nm = find_shortname(nm, users, get_name)
    if not nm:
        print("      Name was not found in active users.  Ignoring.",
              file=sys.stderr)
        return True

    for door in sorted(users.doors(nm)):
        users.move_user_door_to(nm, door, expired)
        print(f"    Deactivating user {nm} - {door}")

    return True


def cmd_revive(parms):
    """ re-activate the given user, if he/she's expired
    parms[0] = invoking cmd
    parms[1] = shortname, optional
    """
    def get_name():
        return input("  Enter a shortname to match one user: ")

    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = get_name()

    nm = find_shortname(nm, expired, get_name)
    if not nm:
        print("      Name was not found in expired users.  Ignoring.",
              file=sys.stderr)
        return True

    for door in expired.doors(nm):
        expired.move_user_door_to(nm, door, users)
        print(f"    Re-activating user {nm} - {door}")

    return True


def cmd_save(parms):
    """ write everything back to disk
    """
    if users.modified:
        users.write_to_file()
    if expired.modified:
        expired.write_to_file()
    if lt.modified:
        lt.write_to_file()
    print("-> Saved all changes!")
    return True


def cmd_quit(parms):
    """ quit the program, asking to save if applicable
    parms[0] = invoking cmd
    """
    if users.modified or expired.modified or lt.modified:
        # pylint: disable-next=possibly-used-before-assignment
        if batchmode:
            cmd_save(parms)
        else:
            inp = input("  Save changes? (y/n): ")
            if inp in 'yYjJ':
                cmd_save(parms)
            elif inp in 'nN':
                users.modified = False
                expired.modified = False
                lt.modified = False
                print("-> Discarded all changes!")
            else:
                print("    Please answer 'y' or 'n' ...")
                return True
    return False


def cmd_usage(parms):
    """ show brief command summary
    parms[0] = invoking cmd
    """
    print('Commands can be entered interactively at the prompt "Command:" or via the shell command line.')
    for command in commands:
        c_abrev = command[0]
        #if len(command) > 1:
        #    c_abrev += '[' + command[1:] + ']'
        c_abrev += '[' + command[1:] + '] '  if len(command) > 1 else ' '
        c_abrev += commands[command][2]
        print(f'{c_abrev:33} - {commands[command][1]}')
    print()
    print('Whenever asked for a "shortname", you may enter a unique substring of a full user name.')
    print('The command "list <shortname>" will show in advance who will be matching.')
    return True


def cmd_help(parms):
    """ show help
    parms[0] = invoking cmd
    parms[1] = command, optional
    """
    if len(parms) == 1:
        print('Valid commands:\n' + " | ".join(commands.keys()))
        print()
        print('You can enter "help <command>" for detail.')
        print('All commands may be abbreviated to the unique start of the keyword.')
    else:
        parm1 = get_cmd(parms[1:])
        if parm1:
            print(f'{parms[1]}: {parm1[1]}')
            if parm1[2]:
                print(f'  Optional argument(s):  {parm1[2]}')
        else:
            print(f'Help for command {parms} isn\'t available yet.')
    print()
    return True


# Ideally each command starts with unique letter(s) to allow abbreviation.
commands = {'list':   (cmd_list,   'List active & expired users and lifetime rules;\n'
                                   '\toptionally filter by <match> (string or regular expression)', '[<match>]'),
            'new':    (cmd_new,    'Create new user account', '<user> [<doors>]'),
            'delete': (cmd_delete, 'Delete a user completely', '<shortname>'),
            'expire': (cmd_expire, 'Set or clear user\'s lifetime rule, if any', '<shortname> [<lifetime>]'),
            'kill':   (cmd_kill,   'Disable one active user', '<shortname>'),
            'revive': (cmd_revive, 'Re-activate one expired user', '<shortname>'),
            'save':   (cmd_save,   'Save changes to file(s)', ''),
            'quit':   (cmd_quit,   'Close user management, possibly asking to save changes', ''),
            'usage':  (cmd_usage,  'Show command summary', ''),
            'help':   (cmd_help,   'Show command list or help for a specific command', '<command>'),
            '?':      (cmd_help,   'Show command list or help for a specific command', '<command>'),
            'check':  (cmd_check,  'Check expiration of all users, typically as nightly CRON job', ''),
            }


# ===== main =====


if __name__ == '__main__':

    print("Meffi.s Lock - User Management")
    print()
    lt = Lifetimes()
    users = ActiveUsers(lt)
    expired = ExpiredUsers(lt)
    args = sys.argv[1:]
    batchmode = bool(len(args) >= 1)
    if not batchmode:
        cmd_usage('dummy')
        print()

    print(f'We have {len(users.user_keys())} active users, {len(expired.user_keys())} '
          f'expired users and {len(lt.user_keys())} lifetime rules. ')
    print()

    while True:
        if not batchmode:
            line = input("Command: ")
            args = line.split(" ")

        cmd = get_cmd(args)
        if cmd:
            cont = cmd[0](args)

            if not cont or batchmode:
                cmd_quit('dummy')
                sys.exit(0)
        else:
            if not batchmode:
                print('Input not recognized, you might need "help".  Ignoring.',
                      file=sys.stderr)
            else:
                print('Input not recognized, you might need "help".  Terminating.',
                      file=sys.stderr)
                sys.exit(1)
