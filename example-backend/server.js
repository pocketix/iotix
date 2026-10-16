// Example backend for the IoTiX editor demos (iotix-react, iotixng).
//
// Serves the device groups, programs and meta-languages the demos' settings
// panel reads, and evaluates programs with the iotix-node interpreter for the
// demos' Evaluate button. Data comes from snapshot.json and is never changed:
// every evaluation is a dry run against the snapshot's parameter values.
//
// Uses only Node's standard library and the iotix-node submodule next to this
// folder (run `npm run setup` once to build it).

const http = require("http");
const path = require("path");
const fs = require("fs");

const interpreterPath = path.join(__dirname, "..", "iotix-node", "dist");

if (!fs.existsSync(interpreterPath)) {
    console.error("iotix-node is not built yet - run `npm run setup` first.");
    process.exit(1);
}

const {ProgramRunner, ProgramRunnerError, ReferencedValue, ValueType} = require(interpreterPath);

const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "snapshot.json"), "utf8"));

// The demos name things by the device's uid, which need not be numeric
// ("device_uid_1"): parameters as `<deviceUid>.<parameter name>` and
// capabilities as `<deviceUid>.<capability id>`. The interpreter wants a numeric
// device id and commands named `<deviceId>.<commandId>.<commandValue>`, so this
// backend, as the system embedding the interpreter, maps between the two.
const devices = [...new Map(
    Object.values(snapshot.groupsById)
        .flatMap(group => group.devices || [])
        .map(device => [device.deviceUid, device])
).values()].map((device, index) => ({...device, numericId: index + 1}));

const deviceByUid = new Map(devices.map(device => [device.deviceUid, device]));
const deviceByNumericId = new Map(devices.map(device => [device.numericId, device]));

// Same shape the interpreter itself recognises as a reference.
const REFERENCE_REGEX = /(\w+)\.([A-Za-z_]\w*)/g;

class BackendError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const unknownName = (name) => new BackendError(400,
    `Unknown device parameter or capability "${name}". The demo sends ids only for the devices of the group ` +
    "selected in its settings panel, so select a group and use one of its programs first.");

function toInterpreterReferences(text) {
    return text.replace(REFERENCE_REGEX, (token, deviceUid, parameterName) => {
        const device = deviceByUid.get(deviceUid);

        if (!device || !device.parameterValues?.some(parameter => parameter.type.name === parameterName)) {
            throw unknownName(token);
        }

        return `${device.numericId}.${parameterName}`;
    });
}

function toInterpreterCommandName(name) {
    const separator = name.lastIndexOf(".");
    const device = deviceByUid.get(name.slice(0, separator));
    const capability = device?.capabilities?.find(item => String(item.id) === name.slice(separator + 1));

    if (!capability) {
        throw unknownName(name);
    }

    // The third segment is a label for the command; this example uses the capability name.
    return `${device.numericId}.${capability.id}.${capability.name.replace(/\W/g, "_")}`;
}

function toInterpreterProgram(program) {
    const statement = (raw) => {
        const converted = {...raw};

        if (typeof raw.condition === "string") {
            converted.condition = toInterpreterReferences(raw.condition);
        }

        if (Array.isArray(raw.block)) {
            converted.block = raw.block.map(statement);
        } else if (raw.name === "write" && Array.isArray(raw.params)) {
            converted.params = [toInterpreterReferences(String(raw.params[0])), ...raw.params.slice(1)];
        } else if (Array.isArray(raw.params)) {
            converted.name = toInterpreterCommandName(raw.name);
        }

        return converted;
    };

    if (!program || !Array.isArray(program.block)) {
        throw new BackendError(400, 'Expected a program shaped {"block": [...]}.');
    }

    return {...program, block: program.block.map(statement)};
}

class SnapshotValue extends ReferencedValue {
}

const referenceManagerAndCommander = {
    async load(references) {
        return references.map(({deviceId, parameterName}) => {
            const parameter = deviceByNumericId.get(deviceId).parameterValues
                .find(item => item.type.name === parameterName);
            const value = new SnapshotValue();

            value.deviceId = deviceId;
            value.parameterName = parameterName;
            value.type = parameter.type.type === "number" ? ValueType.Number : ValueType.String;
            value.value = parameter.type.type === "number" ? parameter.number : parameter.string;

            return value;
        });
    },

    // Dry run: commands are only returned to the caller, and parameter
    // changes made by write statements are not stored.
    async sendCommands() {
    },

    async store() {
    }
};

async function runProgram(program) {
    const runner = new ProgramRunner()
        .setCommander(referenceManagerAndCommander)
        .setReferenceManager(referenceManagerAndCommander);

    try {
        runner.parseProgram(toInterpreterProgram(program));

        const {commands} = await runner.run(true);

        return commands.map(command => ({
            name: `${deviceByNumericId.get(command.deviceId).deviceUid}.${command.commandId}`,
            params: command.params
        }));
    } catch (error) {
        if (error instanceof ProgramRunnerError) {
            throw new BackendError(400, error.message);
        }

        throw error;
    }
}

function found(value) {
    if (value === undefined) {
        throw new BackendError(404, "Not found");
    }

    return value;
}

const routes = [
    ["GET", /^\/groups$/, () => snapshot.groups],
    ["GET", /^\/groups\/(\d+)$/, (id) => found(snapshot.groupsById[id])],
    ["GET", /^\/programs\/ofGroup\/(\d+)$/, (id) => snapshot.programsOfGroup[id] ?? []],
    ["GET", /^\/programs\/meta\/(\w+)$/, (version) => found(snapshot.metaLanguages[version])],
    ["POST", /^\/programs\/v1\/run$/, (body) => runProgram(body)]
];

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => body += chunk);
        request.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : undefined);
            } catch {
                reject(new BackendError(400, "Request body is not valid JSON."));
            }
        });
        request.on("error", reject);
    });
}

const server = http.createServer(async (request, response) => {
    // The demos may be served from another origin, e.g. GitHub Pages.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
    }

    const {pathname} = new URL(request.url, "http://localhost");
    const send = (status, body) => response
        .writeHead(status, {"Content-Type": "application/json"})
        .end(JSON.stringify(body));

    try {
        const route = routes.find(([method, pattern]) => method === request.method && pattern.test(pathname));

        if (!route) {
            throw new BackendError(404, "Not found");
        }

        const [, pattern, handler] = route;
        const argument = request.method === "POST" ? await readJson(request) : pathname.match(pattern)[1];

        send(200, await handler(argument));
    } catch (error) {
        if (!(error instanceof BackendError)) {
            console.error(error);
        }

        send(error.status ?? 500, {message: error instanceof BackendError ? error.message : "Internal error"});
    }
});

if (require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => console.log(`IoTiX example backend on http://localhost:${port}`));
}

module.exports = {server, runProgram};
