from app.tunnel import parse_routes, targets_port

STATUS = """Profile: default
Tunnel ID: pagbc52drfuq
Hostname: pagbc52drfuq.opentunnel.xyz
Certificate expiry: 2027-01-22T23:59:59.000Z

dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz  \u2192  127.0.0.1:3000

Service: connected, 1 active connection(s) (pid 23207, profile default)
"""


def test_parse_routes_ignores_headers():
    assert parse_routes(STATUS) == [
        ("dc74e10b652050c0.pagbc52drfuq.opentunnel.xyz", "127.0.0.1:3000")
    ]


def test_targets_port_matches_local_targets():
    assert targets_port("127.0.0.1:3000", 3000)
    assert targets_port("localhost:3000", 3000)
    assert targets_port("3000", 3000)
    assert targets_port(":3000", 3000)


def test_targets_port_rejects_other_ports_and_hosts():
    assert not targets_port("127.0.0.1:3001", 3000)
    assert not targets_port("10.0.0.5:3000", 3000)
    assert not targets_port("not-a-target", 3000)
