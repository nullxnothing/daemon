/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/daemon_registry.json`.
 */
export type DaemonRegistry = {
  "address": "1ShZWX3vGJqPsMXd3Zgvw7Q9xiix2WPoFGv4YYsx3FG",
  "metadata": {
    "name": "daemonRegistry",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain registry for AI agent development sessions"
  },
  "instructions": [
    {
      "name": "closeSession",
      "discriminator": [
        68,
        114,
        178,
        140,
        222,
        38,
        248,
        211
      ],
      "accounts": [
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "session.session_id",
                "account": "agentSession"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "session"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "endSession",
      "discriminator": [
        11,
        244,
        61,
        154,
        212,
        249,
        15,
        66
      ],
      "accounts": [
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "session.session_id",
                "account": "agentSession"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "session",
            "profile"
          ]
        }
      ],
      "args": [
        {
          "name": "toolsMerkleRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "linesGenerated",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initializeProfile",
      "discriminator": [
        32,
        145,
        77,
        213,
        58,
        39,
        251,
        234
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "registerProject",
      "discriminator": [
        130,
        150,
        121,
        216,
        183,
        225,
        243,
        192
      ],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "projectHash"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "projectHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "durationSecs",
          "type": "u64"
        }
      ]
    },
    {
      "name": "startSession",
      "discriminator": [
        23,
        227,
        111,
        142,
        212,
        230,
        3,
        175
      ],
      "accounts": [
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "sessionId"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sessionId",
          "type": "u64"
        },
        {
          "name": "projectHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "agentCount",
          "type": "u8"
        },
        {
          "name": "modelsUsed",
          "type": {
            "array": [
              "u8",
              4
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentSession",
      "discriminator": [
        25,
        98,
        70,
        4,
        139,
        110,
        56,
        102
      ]
    },
    {
      "name": "developerProfile",
      "discriminator": [
        124,
        166,
        166,
        245,
        18,
        106,
        19,
        219
      ]
    },
    {
      "name": "projectRecord",
      "discriminator": [
        93,
        174,
        112,
        203,
        231,
        123,
        92,
        56
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "sessionAlreadyActive",
      "msg": "Session is already active"
    },
    {
      "code": 6001,
      "name": "sessionNotActive",
      "msg": "Session is not active"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Unauthorized: signer does not match authority"
    },
    {
      "code": 6003,
      "name": "invalidProjectHash",
      "msg": "Invalid project hash: must be 32 bytes"
    },
    {
      "code": 6004,
      "name": "profileAlreadyExists",
      "msg": "Developer profile already exists"
    },
    {
      "code": 6005,
      "name": "sessionNotCompleted",
      "msg": "Session must be completed before closing"
    },
    {
      "code": 6006,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "agentSession",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "sessionId",
            "type": "u64"
          },
          {
            "name": "projectHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "agentCount",
            "type": "u8"
          },
          {
            "name": "modelsUsed",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "toolsMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "linesGenerated",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "developerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "totalSessions",
            "type": "u64"
          },
          {
            "name": "totalDurationSecs",
            "type": "u64"
          },
          {
            "name": "totalAgentsSpawned",
            "type": "u64"
          },
          {
            "name": "projectsCount",
            "type": "u16"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "projectRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "projectHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sessionCount",
            "type": "u32"
          },
          {
            "name": "totalDurationSecs",
            "type": "u64"
          },
          {
            "name": "lastSessionAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
