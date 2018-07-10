'use strict';

var typescript = require('typescript');
var assert = require("assert");

var TS_COMPILER_OPTIONS = {
    allowJs: true,
    checkJs: true,
    forceConsistentCasingInFileNames: true,
    module: "CommonJS",
    moduleResolution: "Node",
    noEmit: true,
    noErrorTruncation: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    strict: true,
    target: "ES5"
}

/*
    The hardest thing to infer is inferring generics.
    So the first examples to drive the program should leverage
    generics and their implementation and/or usage.
*/
function TypeInferer(entryFile, options) {
    options = options || {};

    this.entryFile = entryFile;
    this.ast = null;
    this.tsChecker = null;
    this.knownLanguageOperators = null;
    this.sourceFileCopy = null;
    this.currentScope = null;

    this._compilerHost = options.compilerHost || null;
}

/*
    When tasked to infer the program we can do one of two things

    Either run the inference algorithm and generate output text
    that is valid typescript.

    Or we temporarily generate valid typescript and then run
    typescript on it to verify if its sound and output typescript
    errors.
*/
TypeInferer.prototype.inferProgram = function inferProgram() {
    var program = typescript.createProgram(
        [this.entryFile], TS_COMPILER_OPTIONS, this._compilerHost
    );

    // this.verifyDiagnostics(program);

    this.ast = program.getSourceFile(this.entryFile);
    this.sourceFileCopy = this.ast.text.split("\n");
    this.tsChecker = program.getTypeChecker();
    this.knownLanguageOperators = buildLanguageOperators(this.tsChecker);
    this.traverseAST(this.ast);

    // TODO: create a new program with a compiler host backed by
    // the copy source and the filename rewriting to .ts
    // Then verify that one instead.
    // We want to print any failures to STDOUT ( but only in CLI mode. )
};

TypeInferer.prototype.traverseAST = function traverseAST(ast) {
    switch (ast.kind) {
        case typescript.SyntaxKind.SourceFile:
            return this.traverseSourceFile(ast);
        case typescript.SyntaxKind.ExpressionStatement:
            return this.traverseExpressionStatement(ast);
        case typescript.SyntaxKind.StringLiteral:
            return this.traverseStringLiteral(ast);
        case typescript.SyntaxKind.FunctionDeclaration:
            return this.traverseFunctionDeclaration(ast);
        case typescript.SyntaxKind.Block:
            return this.traverseBlock(ast);
        case typescript.SyntaxKind.ReturnStatement:
            return this.traverseReturnStatement(ast);
        case typescript.SyntaxKind.BinaryExpression:
            return this.traverseBinaryExpression(ast);
        case typescript.SyntaxKind.Identifier:
            return this.traverseIdentifier(ast);
        case typescript.SyntaxKind.FirstLiteralToken:
            return this.traverseFirstLiteralToken(ast);
        case typescript.SyntaxKind.CallExpression:
            return this.traverseCallExpression(ast);
    }

    console.log("unknown AST type", 
        ast.kind, 
        typescript.SyntaxKind[ast.kind]
    );
};

TypeInferer.prototype.traverseIdentifier =
function traverseIdentifier(ast) {
    return;
};

TypeInferer.prototype.traverseFirstLiteralToken =
function traverseFirstLiteralToken(ast) {
    return;
};

TypeInferer.prototype.traverseCallExpression =
function traverseCallExpression(ast) {
    for (var i = 0; i < ast.arguments.length; i++) {
        this.traverseAST(ast.arguments[i]);
    }
    this.traverseAST(ast.expression);
};

/* 
    binary expressions are synthetic function calls
    If a free variable is used in a "function" call we should
    identify what the function type is and then verify what the
    function parameters *MUST* be.
*/
TypeInferer.prototype.traverseBinaryExpression =
function traverseBinaryExpression(ast) {
    this.traverseAST(ast.left);
    this.traverseAST(ast.right);

    var leftSymbol = this.tsChecker.getSymbolAtLocation(ast.left);
    var rightSymbol = this.tsChecker.getSymbolAtLocation(ast.right);

    if (!leftSymbol && !rightSymbol) {
        return;
    }

    var operatorType = this.getOperatorType(ast.operatorToken);
    console.log("wtf", operatorType);

    if (leftSymbol) {
        var name = leftSymbol.escapedName;
        var param = this.currentScope.getParameter(name);
        this.currentScope.constrainParameter(name, operatorType.parameters[0]);
    }
    if (rightSymbol) {
        var name = rightSymbol.escapedName;
        var param = this.currentScope.getParameter(name);
        this.currentScope.constrainParameter(name, operatorType.parameters[1]);
    }
}

TypeInferer.prototype.getOperatorType =
function getOperatorType(astToken) {
    // TODO: we cant build TS types dynamically.
    // We have to create a builtins.ts file and preload it to fetch the
    // types out of that file and operate on that instead.
    switch (astToken.kind) {
        case typescript.SyntaxKind.AsteriskToken:
            return this.knownLanguageOperators.NUMERIC_BINARY_OPERATOR;
    }
}

TypeInferer.prototype.traverseReturnStatement =
function traverseReturnStatement(ast) {
    this.traverseAST(ast.expression);
};

TypeInferer.prototype.traverseBlock =
function traverseBlock(ast) {
    for (var i = 0; i < ast.statements.length; i++) {
        this.traverseAST(ast.statements[i]);
    }
};

TypeInferer.prototype.traverseFunctionDeclaration =
function traverseFunctionDeclaration(ast) {
    var scope = new FunctionScope(null, ast.name.escapedText, ast);
    var oldScope = this.currentScope;
    this.currentScope = scope;

    scope.markParameters();
    this.traverseAST(ast.body);

    for (var i = 0; i < ast.parameters.length; i++) {
        var param = ast.parameters[i];
        var paramName = param.name.escapedText;
        var len = param.end - param.pos;
        var loc = this.ast.getLineAndCharacterOfPosition(param.pos);
        
        var line = this.sourceFileCopy[loc.line];
        var head = line.split(0, loc.character);
        var tail = line.split(loc.character + len, line.length);

        var paramaterType = this.currentScope.getParameter(paramName)
        assert(paramaterType.knownTypes.length === 1,
            "weird knownTypes length");
        var knownType = paramaterType.knownTypes[0];
        // TODO: ensure we have knownType populated

        var newLine = head + paramName + ": " + ";";
        // TODO: update this.sourceFileCopy

    }

    //TODO: Do something with scope.parameters

    this.currentScope = oldScope;
};

TypeInferer.prototype.traverseStringLiteral =
function traverseStringLiteral(ast) {
    return;
};

TypeInferer.prototype.traverseExpressionStatement =
function traverseExpressionStatement(ast) {
    this.traverseAST(ast.expression);
};

TypeInferer.prototype.traverseSourceFile = 
function traverseSourceFile(ast) {
    for (var i = 0; i < ast.statements.length; i++) {
        this.traverseAST(ast.statements[i]);
    }
};

TypeInferer.prototype.verifyDiagnostics = 
function verifyDiagnostics(program) {
    var errors = program.getDeclarationDiagnostics();
    reportErrors(errors, "declaration");

    errors = program.getSemanticDiagnostics();
    reportErrors(errors, "semantic");

    errors = program.getSyntacticDiagnostics();
    reportErrors(errors, "syntactic");

    errors = program.getGlobalDiagnostics();
    reportErrors(errors, "global");

    errors = program.getOptionsDiagnostics();
    reportErrors(errors, "options");
};

function FunctionScope(parent, funcName, funcNode) {
    this.type = "function";
    this.parent = null;

    this.parameters = Object.create(null);

    this.funcName = funcName;
    this.funcASTNode = funcNode;
}

FunctionScope.prototype.markParameters =
function markParameters() {
    for (var i = 0; i < this.funcASTNode.parameters.length; i++) {
        var param = this.funcASTNode.parameters[i];
        var name = param.name.escapedText;

        this.parameters[name] = {
            type: "param",
            knownTypes: []
        };
    }
};

FunctionScope.prototype.getParameter =
function getParameter(name) {
    if (this.parameters[name]) {
        return this.parameters[name];
    }

    return null;
};

FunctionScope.prototype.constrainParameter =
function constrainParameter(name, newType) {
    assert(this.parameters[name], "unknown paramater: " + name);

    this.parameters[name].knownTypes.push(newType);
}

function ApplicationCallType(parameters) {
    this.parameters = parameters;
}

function buildLanguageOperators(tsChecker) {
    return {
        NUMERIC_BINARY_OPERATOR: new ApplicationCallType([
            tsChecker.getContextualType(
                typescript.createNumericLiteral("0")
            ),
            tsChecker.getContextualType(
                typescript.createNumericLiteral("0")
            )
        ])
    };
}

function reportErrors(errors, typeOf) {
    for (var i = 0; i < errors.length; i++) {
        console.log("found a diagnostic message from TypeScript", {
            type: typeOf,
            error: errors[i]
        });
    }
}

module.exports = TypeInferer;