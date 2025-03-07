#!/usr/bin/env python3
# vim: fdm=syntax:ai:si:smarttab:softtabstop=4:sw=4
""" User Management Tool for meffis-lock
    Can be used as an interactive tool, when invoked with no commandline
    parameters, or as a batch tool, when exactly 1 command is given.
"""

#TODO Ablauf incl. Uhrzeit erlauben - würde häufigeren CRON Job erfordern: minütlich, stündlich?
#TODO Startdatum für Zugang

import sys
from abc import ABC, abstractmethod
from pathlib import Path
from time import time
from datetime import date, datetime, timedelta
from getpass import getpass
from functools import cache
import subprocess
import json
import re
from random import randbytes
from hashlib import pbkdf2_hmac
from base64 import b64encode


HOME_DIR = Path.home() / 'meffis-lock' / 'backend'

DOORS = { '1': '', '2': '-einheit2', 'w': '-werkstatt' }

PWD_ITERATIONS = 10000
PWD_SALTLENGTH = 128

RE_LIFETIME_RULE = r"^(\+?)(\d+)d$"


def users_file(door):
    """ Return filename of users file for given door
    """
    return  f"users{DOORS[door]}.json"


def log_file(door):
    """ Return filename of log file for given door
    """
    return  f"log{DOORS[door]}.txt"


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

    def exists(self, user):
        """ check existance of given name
        """
        # return user.lower() in [n.lower() for n in self.user_keys()]
        return user in self.user_keys()

    def user_keys(self):
        """ Return names (keys) of all known users
        """
        return self._users  #.keys()

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
            self._users[user]['doors'] = self._users[user]['doors'].difference(door)
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
                self.remove_door(user,door)
            self.modified = True

    @cache
    def last_login(self, user):
        """ return latest date of any user action found in lock logs or None
        """
        latest = guess_date_from_timestamp(self._users[user].get('modified', 0))
        for door in self.doors(user):
            res = subprocess.run(['grep', user, HOME_DIR / log_file(door)], stdout=subprocess.PIPE)
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
        if not door in self.doors(user):
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
        """ Write users to file for a specific door (the current per-door files),
            or all in one (for expired.json) - similar to in-mem structure.
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
            ret = f" {name : <40}  "
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
            ret = f" {name : <40}  "
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


#===== helper funcs =====


def get_cmd(token):
    """ find 1st matching command, or return None
    """
    for cmd in commands:
        if cmd[:len(token[0])] == token[0].lower():
            return commands[cmd]
    return None


def encode_password(passwd):
    """ encode a password same way as the JS code would
        returns dictionary with salt and hash
    """
    pswd = bytes(passwd, 'utf-8')
    salt = b64encode(randbytes(PWD_SALTLENGTH))
    hashed = pbkdf2_hmac('sha512', pswd, salt, PWD_ITERATIONS, PWD_SALTLENGTH)
    hashed = b64encode(hashed)
    return {'salt': str(salt, 'utf-8'), 'hash': str(hashed, 'utf-8')}


#===== command handlers =====


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
    for name in users.user_keys():
        ln = users.user_state(name)
        if re.search(joker, ln):
            had_one = True
            print(ln)
    if not had_one:
        print(' -none-')

    print(f'=== expired users{matching} ===')
    had_one = False
    for name in expired.user_keys():
        ln = expired.user_state(name)
        if re.search(joker, ln):
            had_one = True
            print(ln)
    if not had_one:
        print(' -none-')

    print(f'=== lifetimes{matching} ===')
    for name in lt.user_keys():
        expire = lt.expiration(name, users.doors(name))
        ln = f' {name : <30}: {expire}'
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
        if users.exists(nm):
            print("    This name does exist!  Aborting.", file=sys.stderr)
            return True
        if expired.exists(nm):
            print("    This name exists as expired user! Try to 'revive'.  Aborting."
                 , file=sys.stderr)
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

    #if len(parm) > 3:
    #    pw =  #TODO read from file, to not expose it in shell log
#else:
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
    parms[1] = user name, optional
    """
    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = input("  Enter user name: ")

    if users.exists(nm):
        users.remove_user(nm)
        print(f"      Deleting active user {nm}.")
    elif expired.exists(nm):
        expired.remove_user(nm)
        print(f"      Deleting expired user {nm}.")
    else:
        print(f"      User {nm} not found in active nor expired users.  Ignoring."
             , file=sys.stderr)

    if lt.exists(nm):
        lt.remove_user(nm)
        print(f"      Deleting lifetime rule for user {nm}.")

    return True


def cmd_expire(parms):
    """ add or change a user's lifetime rule
    parms[0] = invoking cmd
    parms[1] = user name, optional
    parms[2] = lifetime, optional, this can be one of
      - absolute ISO date:  "2023-12-06"
      - absolute POSIX timestamp:  1713637154  (= 2024-04-20T20:xx) 
      - duration in days relative to user's modified date:  "30d"
      - duration in days relative to last lock operation:  "+10d"
      - infinite:  "*"
    """
    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = input("  Enter user name: ")

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
        if not users.exists(nm):
            print(f"      \7WARNING: user {nm} not found in active users. This might be a typo."
                 , file=sys.stderr)
        for door in DOORS:
            if users.is_expired(nm, door):
                print("    \7WARNING: lifetime formatted incorrectly, or resulting date is in the past!"
                     , file=sys.stderr)
    else:
        if lt.exists(nm):
            lt.remove_user(nm)
            print(f"      Deleting lifetime rule for user {nm}.")
        else:
            print(f"      \7WARNING: user {nm} has no explicit rule, cannot clear it."
                 , file=sys.stderr)

    return True


def cmd_check(parms):
    """ check expiration for each active user
    parms[0] = invoking cmd
    """
    # check expiration of ALL active users - usually triggered as cron job
    for name in users.user_keys().copy():
        for door in users.doors(name).copy():
            exp = users.is_expired(name, door)
            if exp:
                users.move_user_door_to(name, door, expired)
                print(f"  Expiring user {name} - door {door}")
    return True


def cmd_revive(parms):
    """ re-activate the given user, if he/she's expired
    parms[0] = invoking cmd
    parms[1] = user name, optional
    """
    if len(parms) > 1:
        nm = parms[1]
    else:
        nm = input("  Enter user name: ")

    if expired.exists(nm):
        for door in expired.doors(nm):
            exp = expired.is_expired(nm, door)
            if exp:
                expired.move_user_door_to(nm, door, users)
                print(f"    Re-activating user {nm} - {door}")
    else:
        print(f"      User {nm} not found in expired users.  Aborting.", file=sys.stderr)
    return True


def cmd_save(parms):
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
        if BATCH:
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
    for cmd in commands:
        c_abrev = cmd[0] + '[' + cmd[1:] + ']'
        print(f'{c_abrev:10} - {commands[cmd][1]}')
    return True


def cmd_help(parms):
    """ show help
    parms[0] = invoking cmd
    parms[1] = command, optional
    """
    if len(parms) == 1:
        print('Valid commands: ' + " | ".join(commands.keys()))
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
commands = { 'list':   (cmd_list,   'Show active users, expired users, and lifetime rules; '\
                                    'limit to matches (string or regular expression)', '<match>')
           , 'new':    (cmd_new,    'Create new user account', '<user> [<doors>]' )
           , 'delete': (cmd_delete, 'Delete a user completely', '<user>')
           , 'expire': (cmd_expire, 'Set individual lifetime', '<user> [<lifetime>]' )
           , 'check':  (cmd_check,  'Check expiration of all users', '')
           , 'revive': (cmd_revive, 'Re-activate one expired user', '<user>')
           , 'save':   (cmd_save,   'Save changes to file(s)', '')
           , 'quit':   (cmd_quit,   'Close user management, possibly asking to save changes', '')
           , 'usage':  (cmd_usage,  'Show command summary', '')
           , 'help':   (cmd_help,   'Show command list or help for a specific command', '<command>')
           , '?':      (cmd_help,   'Show command list or help for a specific command', '<command>')
           }


#===== main =====


if __name__ == '__main__':
    print("Meffi.s Lock - User Management")
    print()
    lt = Lifetimes()
    users = ActiveUsers(lt)
    expired = ExpiredUsers(lt)
    parms = sys.argv[1:]
    BATCH = bool(len(parms) >= 1)

    print(f'We have {len(users.user_keys())} active users, {len(expired.user_keys())} '\
          f'expired users and {len(lt.user_keys())} lifetime rules. ')
    print()

    while True:
        if not BATCH:
            line = input("Command: ")
            parms = line.split(" ")

        cmd = get_cmd(parms)
        if cmd:
            cont = cmd[0](parms)

            if not cont or BATCH:
                cmd_quit('dummy')
                sys.exit(0)
        else:
            print('Input not recognized, you might need "help".  Terminating.'
                 , file=sys.stderr)
            sys.exit(1)
