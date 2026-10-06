IoTiX Project Overview
======================

**IoTiX** is a block- and form-based visual programming language and editor currently being developed by [Petr John](mailto:ijohn@fit.vut.cz), [Jiří Hynek](mailto:hynek@fit.vut.cz) and [Pavel Smrž](https://www.fit.vut.cz/person/smrz/.en)
at [BUT FIT](https://www.fit.vut.cz/.en), primarily aimed at automating smart devices on mobile phones.

The first prototype was created through a collaboration between BUT FIT and [Logimic](https://www.logimic.com/cs/) as part of the project _Services for Water Management and Monitoring Systems in Retention Basins_.

More information is available on the [Pocketix GitHub Organization](https://github.com/pocketix).

This repository is the **umbrella project** for the IoTiX ecosystem: it ties together the editors and the interpreter as git submodules so the whole stack can be cloned and run together.

Submodules
----------

| Submodule | Description |
| --- | --- |
| [`iotix-react`](https://github.com/pocketix/pocketix-react) | React-based drag-and-drop editor for designing automation flows |
| [`iotixng`](https://github.com/pocketix/pocketixng) | Angular-based drag-and-drop editor for designing automation flows |
| [`iotix-node`](https://github.com/pocketix/pocketix-node) | Node.js interpreter that executes automation flows produced by the editors |

### Cloning

```bash
git clone --recurse-submodules git@github.com:pocketix/iotix.git
cd iotix
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

IoTiX Editor (React & Angular)
-------------------------------

**iotix-react** and **iotixng** provide drag-and-drop interfaces for designing automation flows. These editors are ideal for non-programmers and built on React and Angular respectively.

*   [React Editor Demo](https://pocketix-react.pocketix.org/)
*   [Angular Editor Demo](https://pocketixng.pocketix.org/)

### Key Features

*   Block and form-based editing
*   Configurable conditions and actions
*   Device integration and workflow logic
*   Compatible with IoTiX scripting

### Quick Start

```bash
cd iotix-react   # or iotixng
npm run install:all
npm run start:demo
```

IoTiX Node Interpreter
-----------------------

**iotix-node** is the backend logic engine that interprets automation flows from the editors and outputs clean, testable commands — with zero risk of triggering hardware unintentionally.

### Key Features

*   Dry-run automation execution
*   Command & state generation engine
*   Extendable with custom device logic

### Run a Program

```ts
const runner = new ProgramRunner()
	.setCommander(commander)
	.setReferenceManager(referenceManager)
	.parseProgram(program);

const { commands, toUpdate } = await runner.run();
```

### Testing

`npm run test`

Related Links
-------------
*   [Pocketix GitHub Org](https://github.com/pocketix)
*   [Node Core for IoT](https://github.com/pocketix/pocketix-node-core)

Contributing & License
----------------------

All IoTiX components are open-source under the MIT License. Contributions are warmly welcomed via pull requests on GitHub.
