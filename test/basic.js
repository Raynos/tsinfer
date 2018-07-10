var test = require("tape");
var typescript = require("typescript");
var multiline = require("multiline");

var TypeInferer = require("../infer.js");

test("verify straight forward types", function t(assert) {
    var i = setupInferrer(function m() {/*
        'use strict';

        function foo(x) {
            return x * 10;
        }

        foo('Hello, world!');
    */});

    i.inferProgram();

    assert.end();
});

function setupInferrer(source) {
    var text = getText(source);
    var fileName = '/program.js';

    var inferrer = new TypeInferer(fileName, {
        compilerHost: makeCompilerHost(text, fileName)
    });
    return inferrer;
}

function getText(funcOrStr) {
    if (typeof funcOrStr === 'string') {
        return funcOrStr;
    }

    return multiline(funcOrStr);
}

function makeCompilerHost(text, fileName) {
    var host = typescript.createCompilerHost({});
    var oldFn = host.getSourceFile;

    host.getSourceFile = function getSourceFile(name, target) {
        if (name === fileName) {
            return typescript.createSourceFile(fileName, text, target, true);
        }

        return oldFn.apply(this, arguments);
    };
    return host;
}
