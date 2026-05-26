// Deterministic terminal rendering in tests: disable color so assertions can
// match plain text (chat UI tests strip color or force a level explicitly).
process.env["FORCE_COLOR"] = "0";
process.env["NO_COLOR"] = "1";
