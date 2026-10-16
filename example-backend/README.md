IoTiX Example Backend
=====================

A small backend for the editor demos ([iotix-react](https://github.com/pocketix/iotix-react) and [iotixng](https://github.com/pocketix/iotixng)). It serves the device groups, programs and meta-languages the demos' settings panel reads, and evaluates programs with the [iotix-node](https://github.com/pocketix/iotix-node) interpreter when you press **Evaluate**.

The public demos on GitHub Pages run without a backend: they read the same data from a bundled snapshot and have no Evaluate button. Build a demo with a backend URL to get both.

It uses only Node's standard library and the `iotix-node` submodule of this repository. Its data is `snapshot.json`, and nothing is ever written back: every evaluation is a dry run against the snapshot's parameter values.

Running it
----------

Requires Node.js 20 or newer and the submodules (`git clone --recurse-submodules`, or `git submodule update --init` in an existing clone).

```bash
cd example-backend
npm run setup   # installs and builds ../iotix-node, needed once
npm start       # http://localhost:3000, or set PORT
npm test        # endpoint and evaluation tests
```

Then build or start a demo with the backend's URL:

```bash
# iotix-react
REACT_APP_API_BASE_URL=http://localhost:3000 npm run start:demo

# iotixng
API_BASE_URL=http://localhost:3000 npm run start:demo
```

Both editors' Docker images take the URL as a build argument. Their nginx config forwards `/api` to the backend set in `API_URL` at run time:

```bash
docker build --build-arg API_BASE_URL=/api -t iotix-react .
docker run -p 8080:80 -e API_URL=http://<backend host>:3000 iotix-react
```

nginx resolves the `API_URL` host through public DNS, so use an IP address or a public host name, not a Docker container name or `localhost`.

The backend sends `Access-Control-Allow-Origin: *`, so a demo served from another origin can call it directly.

API
---

All responses are JSON. Errors are `{"message": "..."}` with status 400 (bad program or unknown name) or 404 (unknown group or version).

| Method | Path                       | Returns                                                        |
|--------|----------------------------|----------------------------------------------------------------|
| GET    | `/groups`                  | All device groups, without device details                      |
| GET    | `/groups/{id}`             | One group with its devices, their parameters and capabilities  |
| GET    | `/programs/ofGroup/{id}`   | The group's saved programs, `[]` if it has none                |
| GET    | `/programs/meta/{version}` | The meta-language the programs of that version are written in  |
| POST   | `/programs/v1/run`         | The commands a program triggers                                |

### Devices and names

A group's devices come with parameters and capabilities:

```json
{
  "id": 1,
  "name": "Living Room",
  "devices": [
    {
      "deviceUid": "1",
      "deviceName": "Power Strip",
      "parameterValues": [
        {"number": 1, "string": null, "type": {"name": "socket_1", "label": "Socket 1", "type": "number"}}
      ],
      "capabilities": [
        {"id": 3, "name": "Switch state", "parameters": [{"param": ""}]}
      ]
    }
  ]
}
```

When a group is selected, the demo adds its devices to the editor's language. A parameter becomes a variable named `<device name>.<parameter label>`, here `PowerStrip.Socket 1`. A capability becomes a command named `<device name>.<capability name>`, here `PowerStrip.Switch state`. Spaces and `-+*/.` are dropped from device names.

Programs are stored with ids instead of names. Parameters are `<deviceUid>.<parameter name>` (`1.socket_1`), and capabilities are `<deviceUid>.<capability id>` (`1.3`). The demo turns ids into names when it loads a program and names back into ids before it sends one to Evaluate.

### Evaluate

`POST /programs/v1/run` takes the program with ids:

```json
{
  "block": [
    {
      "name": "if",
      "condition": "17.lvl_measurement_percent_full > 50",
      "block": [{"name": "1.3", "params": ["false"]}]
    }
  ]
}
```

and returns the commands it triggers, with the same ids:

```json
[{"name": "1.3", "params": ["false"]}]
```

The demo shows them as `Triggered capability PowerStrip.Switch state with parameters ["false"]`.

The interpreter needs a numeric device id and commands named `<deviceId>.<commandId>.<commandValue>`, while device uids need not be numeric (`device_uid_1`). As the system embedding the interpreter, this backend maps between the two. It numbers the devices, rewrites `1.socket_1` to `<number>.socket_1` and `1.3` to `<number>.3.Switch_state`, runs the program, and maps the resulting commands back to uids. A name that is not an id of a known device, for example a readable name sent before any group was selected, is rejected with 400 and a message saying so.

Parameter values come from the snapshot (`number` or `string` by the parameter's type). Conditions can also use the interpreter's date functions `hours(now)`, `minutes(now)`, `day(now)`, `month(now)` and `year(now)`, evaluated on the backend's clock. A `write` statement changes the value for the rest of that run only, and stores it exactly as typed, as a string.

Data
----

`snapshot.json` holds three groups (only Living Room has devices: a smart plug, a power strip and a water retention tank), its two programs and meta-language `v1`. It is the data of the former demo backend. Its programs referred to devices by names that matched no id (`Water Level`, `PowerStrip.1`), so they were corrected to the ids above, keeping their logic. The same file is bundled in both editor demos.
