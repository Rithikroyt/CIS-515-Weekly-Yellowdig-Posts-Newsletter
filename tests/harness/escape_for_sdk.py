import sys
sys.stdout.reconfigure(encoding="utf-8")
s = open(sys.argv[1], encoding="utf-8").read()
assert "`" not in s and "${" not in s, "code contains backticks or ${"
sys.stdout.write(s.replace("\\", "\\\\"))
