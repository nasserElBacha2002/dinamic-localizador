# 4B.2 — Implementation

`resolvePolicy` + `loadPolicy` throws on error kind.  
`admitNonCriticalTurn` / `reserveOutbound` fail-closed (`QUOTA_FAILURE` / `POLICY_LOAD_FAILED`) — never MODE_OFF on DB failure.
