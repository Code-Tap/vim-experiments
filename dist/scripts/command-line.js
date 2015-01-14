(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {
	isWall: function() {
		return ['+', '-', '|'].indexOf(this.character) !== -1 && !this.isText;
	},
	isLazer: function() {
		return ['V', '^', '>', '<'].indexOf(this.character) !== -1 && !this.isText;
	},
	isLazerBeam: function() {
		return this.isVerticalLazerBeam || this.isHorizontalLazerBeam;
	},
	isBlocking: function() {
		return this.isWall() || this.isLazer() || this.isLazerBeam();
	},
	toString: function(configuration) {
		var propertyToClassName = {
				'isText': 'text',
				'isUnderCursor': 'cursor',
				'isVerticalLazerBeam': 'vertical-lazer-beam',
				'isHorizontalLazerBeam': 'horizontal-lazer-beam',
				'isUnderTurretFire': 'turret-fire'
			},
			classNames = Object.keys(propertyToClassName).filter(function(key) {
				return this[key];
			}.bind(this)).map(function(key) {
				return propertyToClassName[key];
			}).join(' ');
        if (this.lineNumber) {
            this.character = configuration['display line numbers'] ? this.lineNumber : ' ';
        }

		return '<span  class="' + classNames + '">' + this.character + '</span>';
	}
};

},{}],2:[function(require,module,exports){
var matrixDecorator = require('./matrix-decorator.js'),
	cellDecorator = require('./cell-decorator.js'),
	turretDecorator = require('./turret-decorator.js'),
	cursor = require('./cursor.js');

var chamber = Object.create(matrixDecorator);

chamber.fromJSON = function(json) {
	this.fromArrayOfStrings(json.scene);
	Object.keys(json).filter(function(key) {
		return key !== 'scene';
	}).forEach(function(key) {
		this[key] = json[key];
	}.bind(this));
    this.configuration = json.configuration || {};
};

chamber.initialize = function() {
	this.replaceCharactersWithCells();
	this.markText();
	this.markLazers();
	this.markCursor();
	this.markTurrets();
};

chamber.replaceCharactersWithCells = function() {
	var chamber = this;
	chamber.matrix = chamber.map(function(character, row, column) {
		if (character === '@') {
			chamber.spawnPosition = {
				row: row,
				column: column
			};
		}
		var cell = Object.create(cellDecorator);
		cell.row = row;
		cell.column = column;
		cell.character = character;
		return cell;
	});
};

chamber.markCursor = function() {
	cursor.reset();
	cursor.setPositionFrom(this.spawnPosition);
};

chamber.markText = function() {
	var isSequenceOfTextInProgress = false,
		lastCellInSequence,
        previousBeginningOfLine;
	this.matrix = this.map(function(cell, row, column) {
		if (isSequenceOfTextInProgress) {
			if (cell.character === '`') {
				isSequenceOfTextInProgress = false;
				lastCellInSequence = chamber.matrix[row][column - 1];
				cell.character = ' ';
			} else {
				cell.isText = true;
				if (lastCellInSequence) {
					if (Math.abs(lastCellInSequence.row - cell.row) === 1) {
						cell.previousTextCell = lastCellInSequence;
						lastCellInSequence.nextTextCell = cell;
					}
					lastCellInSequence = undefined;
				}
			}
		} else if (cell.character === '`') {
			isSequenceOfTextInProgress = true;
            previousBeginningOfLine = chamber.matrix[row - 1][column];
            if (previousBeginningOfLine.lineNumber) {
                cell.lineNumber = previousBeginningOfLine.lineNumber + 1;
            } else {
                lastCellInSequence = undefined;
                cell.lineNumber = 1;
            }
		}

		return cell;
	});
};

chamber.markLazers = function() {
	var matrix = this.matrix;
	this.matrix = this.map(function(cell, row, column) {
		var character = cell.character,
			isVerticalLazerBeam = function() {
				return ['<','>'].indexOf(character) === -1;
			},
			beamProperty = isVerticalLazerBeam() ? 'isVerticalLazerBeam' : 'isHorizontalLazerBeam',
			isBeamContinuing = function() {
				return matrix[row][column].isLazerBeam() || !matrix[row][column].isBlocking();
			},
			next = {
				'V': function() {
					return matrix[row++][column];
				},
				'^': function() {
					return matrix[row--][column];
				},
				'>': function() {
					return matrix[row][column++];
				},
				'<': function() {
					return matrix[row][column--];
				}
			}[character];
		if (next) {
			next();
			while (isBeamContinuing()) {
				next()[beamProperty] = true;
			}
		}
		return cell;
	});
};

chamber.markTurrets = function() {
	var chamber = this;
	this.turrets = [];
	this.matrix = this.map(function(cell, row, column) {
		if (cell.character === '&') {
			var turret = Object.create(turretDecorator);
			turret.row = row;
			turret.column = column;
			turret.cell = cell;
			chamber.turrets.push(turret);
		}
		return cell;
	});
};

chamber.getCellUnderCursor = function() {
	return this.matrix[cursor.row][cursor.column];
};

chamber.render = function() {
	var element = document.querySelector('#scene');
	element.innerHTML = chamber.matrix.map(function(array) {
		array = array.map(function(cell) {
			cell.isUnderCursor = cell.row === cursor.row && cell.column === cursor.column;
            cell = cell.toString(chamber.configuration);
            return cell;
		});
		return array.join('');
	}).join('<br>');
};

chamber.actOnCursor = function() {
	this.turrets.forEach(function(turret) {
		turret.findAndTryToKill(cursor, chamber);
	});
};

module.exports = chamber;

},{"./cell-decorator.js":1,"./cursor.js":4,"./matrix-decorator.js":6,"./turret-decorator.js":8}],3:[function(require,module,exports){
var commands = {},
    mainFunction,
    printText = require('./print.js');
module.exports = commands;

commands['chamber (\\d+)'] = function(chamberNumber) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState !== 4) {
            return;
        }
        var defaultAction = function() {
                window.alert(xmlhttp.status);
            },
            action = {
                '200': function() {
                    localStorage.chamber = chamberNumber;
                    try {
                        mainFunction(JSON.parse(xmlhttp.responseText));
                    } catch (_) {
                        action['404']();
                    }
                },
                '404': function() {
                    window.alert('This is the last chamber at this moment. ' +
                        'Next you are going to be redirected to the repo of this game. ' +
                        'Let me know your favorite VIM features which are missing.');
                    window.location.href = 'https://github.com/hermanya/vim-experiments';
                }
            }[xmlhttp.status] || defaultAction;
        action();

    };
    chamberNumber = chamberNumber || localStorage.chamber || 0;
    xmlhttp.open('GET', './chambers/' + chamberNumber + '.json', true);
    xmlhttp.send();
};

commands['set number'] = function() {
    require('./chamber.js').configuration['display line numbers'] = true;
    require('./chamber.js').render();
};
commands['set nu'] = commands['set number'];

commands['set nonumber'] = function() {
    require('./chamber.js').configuration['display line numbers'] = false;
    require('./chamber.js').render();
};
commands['set nonu'] = commands['set nonumber'];

commands['cake is a lie'] = function() {
    require('./chamber.js').configuration['killing mode on'] = true;
    printText(['','Now you are going to die. Every time.','']);
};

commands.loadNextChamber = function() {
    var nextChamberNumber = Number(localStorage.chamber) + 1;
    commands['chamber (\\d+)'](nextChamberNumber);
};

commands['initialize chamber'] = function(main) {
    mainFunction = main;
    commands['chamber (\\d+)']();
};

},{"./chamber.js":2,"./print.js":7}],4:[function(require,module,exports){
var commands = require('./commands.js'),
    printText = require('./print.js');
module.exports = {
    score: 0,
    actOnCurrentCell: function(chamber) {
        var cursor = this,
            cell = chamber.getCellUnderCursor(),
            action = {
                '*': function() {
                    cell.character = ' ';
                    cursor.score++;
                },
                'O': function() {
                    cursor.hasCompletedLevel = true;
                    var congratulationMessage = {
                        '0': 'You did it, I am bored watching you.',
                        '1': 'Only one pathetic star?',
                        '2': 'Did you even try?'
                    }[cursor.score] || 'Satisfying performace.';
                    if (typeof window !== 'undefined') {
                        printText(['', congratulationMessage, '']);
                        commands.loadNextChamber();
                    }
                },
                '&': function() {
                    cell.isDeactivatedTurret = true;
                    cell.character = ' <div class="deactivated-turret">&</div>';
                }
            }[cell.character];
        if (!cell.isText && action) {
            action();
        }
    },
    reset: function() {
        this.hasCompletedLevel = false;
        this.score = 0;
        this.forgetColumnForVerticalMovement();
    },
    setPositionFrom: function(anotherObject) {
        this.column = anotherObject.column;
        this.row = anotherObject.row;
    },
    rememberColumnForVerticalMovement: function() {
        if (!this.rememberedColumnForVerticalMovement) {
            this.rememberedColumnForVerticalMovement = this.column;
        }
    },
    forgetColumnForVerticalMovement: function() {
        delete this.rememberedColumnForVerticalMovement;
    },
    saveCurrentPosition: function() {
        this.savedColumn = this.column;
        this.savedRow = this.row;
    },
    restoreToSavedPosition: function() {
        this.column = this.savedColumn;
        this.row = this.savedRow;
    }
};

},{"./commands.js":3,"./print.js":7}],5:[function(require,module,exports){
var commands = require('./commands.js');

var commandLine = {
	execute: function() {
		var givenCommand = this.element.value.slice(1); // strip colon
		Object.keys(commands).forEach(function(key) {
			var matches = givenCommand.match(new RegExp(key));
			if (matches) {
				commands[key].apply(this, matches.slice(1)); // strip matching line
			}
		});
	}
};

if (typeof window !== 'undefined') {
	commandLine.element = window.document.querySelector('#command-line');
	commandLine.element.addEventListener('blur', function() {
		if (commandLine.element.value) {
			commandLine.element.focus();
		}
	});
	commandLine.element.addEventListener('keypress', function(e) {
		if (e.which === 13) {
			commandLine.execute();
			commandLine.deactivate();
		}
		e.stopPropagation();
	});
	commandLine.element.addEventListener('keyup', function() {
		if (commandLine.element.value === '') {
			commandLine.deactivate();
		}
	});
	commandLine.activate = function() {
		this.element.focus();
	};
	commandLine.deactivate = function() {
		this.element.value = '';
		this.element.blur();
	};
}

module.exports = commandLine;
},{"./commands.js":3}],6:[function(require,module,exports){
module.exports = {
	fromArrayOfStrings: function (arrayOfStrings) {
		this.matrix = arrayOfStrings.map(function(string) {
			return string.split('');
		});
	},
	map: function(fn) {
		return this.matrix.map(function(array, row) {
			return array.map(function(item, column) {
				return fn(item, row, column);
			});
		});
	},
	getCoordinatesOf: function (thingToFind) {
		var predicate;
		if (typeof thingToFind === 'string') {
			predicate = function(string, anotherString) {
				return string === anotherString;
			};
		}
		if (typeof thingToFind === 'object') {
			predicate = function(thingToFind, anotherObject) {
				return Object.keys(thingToFind).filter(function(key) {
					return thingToFind[key] !== anotherObject[key];
				}).length === 0;

			};
		}
		return this.matrix.reduce(function(found, array, row) {
			array.forEach(function(cell, column) {
				if (predicate(thingToFind, cell)) {
					found.push({
						row: row,
						column: column
					});
				}
			});
			return found;
		}, []);
	}
};
},{}],7:[function(require,module,exports){
var console;
if (typeof window !== 'undefined') {
    console = document.querySelector('#console');
}

var printText = function(text) {
    var line = text.shift();
    if (line !== undefined) {
        window.setTimeout (function() {
            console.innerHTML += text.by + line + '<br>';
            console.scrollTop +=100;
            printText(text);
        }, line.length * 40);
    }

};

module.exports = function(text) {
    if (!Array.isArray(text)) {
        text = [text];
    }
    text.by = text.by ? text.by + '> ' : '';
    printText(text);
};

},{}],8:[function(require,module,exports){
var printText = require('./print.js');
module.exports = {
	findAndTryToKill: function(cursor, chamber) {
	// add some funny excuse for the kill from turret
		if (this.isShooting || this.cell.isDeactivatedTurret) {
			return;
		}
		var turret = this,
		rise = cursor.row - turret.row,
		run = cursor.column - turret.column,
		count = Math.max(Math.abs(rise), Math.abs(run)),
		total = count,
		path = [],
		cell;
		if (!rise && !run) {
			return;
		}
		for (var i = 0; i <= count; i++) {
			cell = chamber.matrix[Math.round(turret.row + rise*(i/total))][Math.round(turret.column + run*(i/total))];
			if (!cell.isLazerBeam() && cell.isBlocking()) {
				break;
			}
			if (cell !== turret.cell && path.indexOf(cell) === -1) {
				path.push(cell);
			}
			if (cell.row === cursor.row && cell.column === cursor.column) {
				turret.tryToKill(cursor, chamber, path);
				break;
			}
		}
	},
	tryToKill: function(cursor, chamber, path) {
		var turret = this;
		setTimeout(function() {
			var isCursorUnderLazer = !path.every(function(cell) {
                return !cell.isUnderCursor;
            });
			if (isCursorUnderLazer) {
				turret.isShooting = true;
				path.forEach(function(cell) {
					cell.isUnderTurretFire = true;
				});
                var message = 'turret> ' + [
                    'I did not mean to.',
                    'They made me do this.',
                    'I am trully sorry.',
                    'Sometimes I can not help myself.',
                    'Watch out.',
                    'Please do not think less of me.'
                ][Math.floor(Math.random() * 3)];
                printText(message);
                if (require('./chamber.js').configuration['killing mode on']) {
                    cursor.setPositionFrom(require('./chamber.js').spawnPosition);
                }
				chamber.render();
				window.setTimeout(function() {
					turret.isShooting = false;
					path.forEach(function(cell) {
						cell.isUnderTurretFire = false;
					});
					chamber.render();
				}, 1000);
			} else {
				turret.findAndTryToKill(cursor, chamber);
			}
		}, 1000);
	}
};

},{"./chamber.js":2,"./print.js":7}]},{},[5])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9oc3Rhcmlrb3Yvd29ya3NwYWNlL3ZpbS1leHBlcmltZW50cy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvaHN0YXJpa292L3dvcmtzcGFjZS92aW0tZXhwZXJpbWVudHMvc3JjL2NlbGwtZGVjb3JhdG9yLmpzIiwiL1VzZXJzL2hzdGFyaWtvdi93b3Jrc3BhY2UvdmltLWV4cGVyaW1lbnRzL3NyYy9jaGFtYmVyLmpzIiwiL1VzZXJzL2hzdGFyaWtvdi93b3Jrc3BhY2UvdmltLWV4cGVyaW1lbnRzL3NyYy9jb21tYW5kcy5qcyIsIi9Vc2Vycy9oc3Rhcmlrb3Yvd29ya3NwYWNlL3ZpbS1leHBlcmltZW50cy9zcmMvY3Vyc29yLmpzIiwiL1VzZXJzL2hzdGFyaWtvdi93b3Jrc3BhY2UvdmltLWV4cGVyaW1lbnRzL3NyYy9mYWtlXzQ4NTQwMDI2LmpzIiwiL1VzZXJzL2hzdGFyaWtvdi93b3Jrc3BhY2UvdmltLWV4cGVyaW1lbnRzL3NyYy9tYXRyaXgtZGVjb3JhdG9yLmpzIiwiL1VzZXJzL2hzdGFyaWtvdi93b3Jrc3BhY2UvdmltLWV4cGVyaW1lbnRzL3NyYy9wcmludC5qcyIsIi9Vc2Vycy9oc3Rhcmlrb3Yvd29ya3NwYWNlL3ZpbS1leHBlcmltZW50cy9zcmMvdHVycmV0LWRlY29yYXRvci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdGlzV2FsbDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFsnKycsICctJywgJ3wnXS5pbmRleE9mKHRoaXMuY2hhcmFjdGVyKSAhPT0gLTEgJiYgIXRoaXMuaXNUZXh0O1xuXHR9LFxuXHRpc0xhemVyOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gWydWJywgJ14nLCAnPicsICc8J10uaW5kZXhPZih0aGlzLmNoYXJhY3RlcikgIT09IC0xICYmICF0aGlzLmlzVGV4dDtcblx0fSxcblx0aXNMYXplckJlYW06IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlzVmVydGljYWxMYXplckJlYW0gfHwgdGhpcy5pc0hvcml6b250YWxMYXplckJlYW07XG5cdH0sXG5cdGlzQmxvY2tpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlzV2FsbCgpIHx8IHRoaXMuaXNMYXplcigpIHx8IHRoaXMuaXNMYXplckJlYW0oKTtcblx0fSxcblx0dG9TdHJpbmc6IGZ1bmN0aW9uKGNvbmZpZ3VyYXRpb24pIHtcblx0XHR2YXIgcHJvcGVydHlUb0NsYXNzTmFtZSA9IHtcblx0XHRcdFx0J2lzVGV4dCc6ICd0ZXh0Jyxcblx0XHRcdFx0J2lzVW5kZXJDdXJzb3InOiAnY3Vyc29yJyxcblx0XHRcdFx0J2lzVmVydGljYWxMYXplckJlYW0nOiAndmVydGljYWwtbGF6ZXItYmVhbScsXG5cdFx0XHRcdCdpc0hvcml6b250YWxMYXplckJlYW0nOiAnaG9yaXpvbnRhbC1sYXplci1iZWFtJyxcblx0XHRcdFx0J2lzVW5kZXJUdXJyZXRGaXJlJzogJ3R1cnJldC1maXJlJ1xuXHRcdFx0fSxcblx0XHRcdGNsYXNzTmFtZXMgPSBPYmplY3Qua2V5cyhwcm9wZXJ0eVRvQ2xhc3NOYW1lKS5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzW2tleV07XG5cdFx0XHR9LmJpbmQodGhpcykpLm1hcChmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0cmV0dXJuIHByb3BlcnR5VG9DbGFzc05hbWVba2V5XTtcblx0XHRcdH0pLmpvaW4oJyAnKTtcbiAgICAgICAgaWYgKHRoaXMubGluZU51bWJlcikge1xuICAgICAgICAgICAgdGhpcy5jaGFyYWN0ZXIgPSBjb25maWd1cmF0aW9uWydkaXNwbGF5IGxpbmUgbnVtYmVycyddID8gdGhpcy5saW5lTnVtYmVyIDogJyAnO1xuICAgICAgICB9XG5cblx0XHRyZXR1cm4gJzxzcGFuICBjbGFzcz1cIicgKyBjbGFzc05hbWVzICsgJ1wiPicgKyB0aGlzLmNoYXJhY3RlciArICc8L3NwYW4+Jztcblx0fVxufTtcbiIsInZhciBtYXRyaXhEZWNvcmF0b3IgPSByZXF1aXJlKCcuL21hdHJpeC1kZWNvcmF0b3IuanMnKSxcblx0Y2VsbERlY29yYXRvciA9IHJlcXVpcmUoJy4vY2VsbC1kZWNvcmF0b3IuanMnKSxcblx0dHVycmV0RGVjb3JhdG9yID0gcmVxdWlyZSgnLi90dXJyZXQtZGVjb3JhdG9yLmpzJyksXG5cdGN1cnNvciA9IHJlcXVpcmUoJy4vY3Vyc29yLmpzJyk7XG5cbnZhciBjaGFtYmVyID0gT2JqZWN0LmNyZWF0ZShtYXRyaXhEZWNvcmF0b3IpO1xuXG5jaGFtYmVyLmZyb21KU09OID0gZnVuY3Rpb24oanNvbikge1xuXHR0aGlzLmZyb21BcnJheU9mU3RyaW5ncyhqc29uLnNjZW5lKTtcblx0T2JqZWN0LmtleXMoanNvbikuZmlsdGVyKGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiBrZXkgIT09ICdzY2VuZSc7XG5cdH0pLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0dGhpc1trZXldID0ganNvbltrZXldO1xuXHR9LmJpbmQodGhpcykpO1xuICAgIHRoaXMuY29uZmlndXJhdGlvbiA9IGpzb24uY29uZmlndXJhdGlvbiB8fCB7fTtcbn07XG5cbmNoYW1iZXIuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLnJlcGxhY2VDaGFyYWN0ZXJzV2l0aENlbGxzKCk7XG5cdHRoaXMubWFya1RleHQoKTtcblx0dGhpcy5tYXJrTGF6ZXJzKCk7XG5cdHRoaXMubWFya0N1cnNvcigpO1xuXHR0aGlzLm1hcmtUdXJyZXRzKCk7XG59O1xuXG5jaGFtYmVyLnJlcGxhY2VDaGFyYWN0ZXJzV2l0aENlbGxzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBjaGFtYmVyID0gdGhpcztcblx0Y2hhbWJlci5tYXRyaXggPSBjaGFtYmVyLm1hcChmdW5jdGlvbihjaGFyYWN0ZXIsIHJvdywgY29sdW1uKSB7XG5cdFx0aWYgKGNoYXJhY3RlciA9PT0gJ0AnKSB7XG5cdFx0XHRjaGFtYmVyLnNwYXduUG9zaXRpb24gPSB7XG5cdFx0XHRcdHJvdzogcm93LFxuXHRcdFx0XHRjb2x1bW46IGNvbHVtblxuXHRcdFx0fTtcblx0XHR9XG5cdFx0dmFyIGNlbGwgPSBPYmplY3QuY3JlYXRlKGNlbGxEZWNvcmF0b3IpO1xuXHRcdGNlbGwucm93ID0gcm93O1xuXHRcdGNlbGwuY29sdW1uID0gY29sdW1uO1xuXHRcdGNlbGwuY2hhcmFjdGVyID0gY2hhcmFjdGVyO1xuXHRcdHJldHVybiBjZWxsO1xuXHR9KTtcbn07XG5cbmNoYW1iZXIubWFya0N1cnNvciA9IGZ1bmN0aW9uKCkge1xuXHRjdXJzb3IucmVzZXQoKTtcblx0Y3Vyc29yLnNldFBvc2l0aW9uRnJvbSh0aGlzLnNwYXduUG9zaXRpb24pO1xufTtcblxuY2hhbWJlci5tYXJrVGV4dCA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgaXNTZXF1ZW5jZU9mVGV4dEluUHJvZ3Jlc3MgPSBmYWxzZSxcblx0XHRsYXN0Q2VsbEluU2VxdWVuY2UsXG4gICAgICAgIHByZXZpb3VzQmVnaW5uaW5nT2ZMaW5lO1xuXHR0aGlzLm1hdHJpeCA9IHRoaXMubWFwKGZ1bmN0aW9uKGNlbGwsIHJvdywgY29sdW1uKSB7XG5cdFx0aWYgKGlzU2VxdWVuY2VPZlRleHRJblByb2dyZXNzKSB7XG5cdFx0XHRpZiAoY2VsbC5jaGFyYWN0ZXIgPT09ICdgJykge1xuXHRcdFx0XHRpc1NlcXVlbmNlT2ZUZXh0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdFx0XHRsYXN0Q2VsbEluU2VxdWVuY2UgPSBjaGFtYmVyLm1hdHJpeFtyb3ddW2NvbHVtbiAtIDFdO1xuXHRcdFx0XHRjZWxsLmNoYXJhY3RlciA9ICcgJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNlbGwuaXNUZXh0ID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGxhc3RDZWxsSW5TZXF1ZW5jZSkge1xuXHRcdFx0XHRcdGlmIChNYXRoLmFicyhsYXN0Q2VsbEluU2VxdWVuY2Uucm93IC0gY2VsbC5yb3cpID09PSAxKSB7XG5cdFx0XHRcdFx0XHRjZWxsLnByZXZpb3VzVGV4dENlbGwgPSBsYXN0Q2VsbEluU2VxdWVuY2U7XG5cdFx0XHRcdFx0XHRsYXN0Q2VsbEluU2VxdWVuY2UubmV4dFRleHRDZWxsID0gY2VsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFzdENlbGxJblNlcXVlbmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjZWxsLmNoYXJhY3RlciA9PT0gJ2AnKSB7XG5cdFx0XHRpc1NlcXVlbmNlT2ZUZXh0SW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgICAgICAgICBwcmV2aW91c0JlZ2lubmluZ09mTGluZSA9IGNoYW1iZXIubWF0cml4W3JvdyAtIDFdW2NvbHVtbl07XG4gICAgICAgICAgICBpZiAocHJldmlvdXNCZWdpbm5pbmdPZkxpbmUubGluZU51bWJlcikge1xuICAgICAgICAgICAgICAgIGNlbGwubGluZU51bWJlciA9IHByZXZpb3VzQmVnaW5uaW5nT2ZMaW5lLmxpbmVOdW1iZXIgKyAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXN0Q2VsbEluU2VxdWVuY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY2VsbC5saW5lTnVtYmVyID0gMTtcbiAgICAgICAgICAgIH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2VsbDtcblx0fSk7XG59O1xuXG5jaGFtYmVyLm1hcmtMYXplcnMgPSBmdW5jdGlvbigpIHtcblx0dmFyIG1hdHJpeCA9IHRoaXMubWF0cml4O1xuXHR0aGlzLm1hdHJpeCA9IHRoaXMubWFwKGZ1bmN0aW9uKGNlbGwsIHJvdywgY29sdW1uKSB7XG5cdFx0dmFyIGNoYXJhY3RlciA9IGNlbGwuY2hhcmFjdGVyLFxuXHRcdFx0aXNWZXJ0aWNhbExhemVyQmVhbSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gWyc8JywnPiddLmluZGV4T2YoY2hhcmFjdGVyKSA9PT0gLTE7XG5cdFx0XHR9LFxuXHRcdFx0YmVhbVByb3BlcnR5ID0gaXNWZXJ0aWNhbExhemVyQmVhbSgpID8gJ2lzVmVydGljYWxMYXplckJlYW0nIDogJ2lzSG9yaXpvbnRhbExhemVyQmVhbScsXG5cdFx0XHRpc0JlYW1Db250aW51aW5nID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHJldHVybiBtYXRyaXhbcm93XVtjb2x1bW5dLmlzTGF6ZXJCZWFtKCkgfHwgIW1hdHJpeFtyb3ddW2NvbHVtbl0uaXNCbG9ja2luZygpO1xuXHRcdFx0fSxcblx0XHRcdG5leHQgPSB7XG5cdFx0XHRcdCdWJzogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1hdHJpeFtyb3crK11bY29sdW1uXTtcblx0XHRcdFx0fSxcblx0XHRcdFx0J14nOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRyZXR1cm4gbWF0cml4W3Jvdy0tXVtjb2x1bW5dO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnPic6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJldHVybiBtYXRyaXhbcm93XVtjb2x1bW4rK107XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCc8JzogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1hdHJpeFtyb3ddW2NvbHVtbi0tXTtcblx0XHRcdFx0fVxuXHRcdFx0fVtjaGFyYWN0ZXJdO1xuXHRcdGlmIChuZXh0KSB7XG5cdFx0XHRuZXh0KCk7XG5cdFx0XHR3aGlsZSAoaXNCZWFtQ29udGludWluZygpKSB7XG5cdFx0XHRcdG5leHQoKVtiZWFtUHJvcGVydHldID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNlbGw7XG5cdH0pO1xufTtcblxuY2hhbWJlci5tYXJrVHVycmV0cyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgY2hhbWJlciA9IHRoaXM7XG5cdHRoaXMudHVycmV0cyA9IFtdO1xuXHR0aGlzLm1hdHJpeCA9IHRoaXMubWFwKGZ1bmN0aW9uKGNlbGwsIHJvdywgY29sdW1uKSB7XG5cdFx0aWYgKGNlbGwuY2hhcmFjdGVyID09PSAnJicpIHtcblx0XHRcdHZhciB0dXJyZXQgPSBPYmplY3QuY3JlYXRlKHR1cnJldERlY29yYXRvcik7XG5cdFx0XHR0dXJyZXQucm93ID0gcm93O1xuXHRcdFx0dHVycmV0LmNvbHVtbiA9IGNvbHVtbjtcblx0XHRcdHR1cnJldC5jZWxsID0gY2VsbDtcblx0XHRcdGNoYW1iZXIudHVycmV0cy5wdXNoKHR1cnJldCk7XG5cdFx0fVxuXHRcdHJldHVybiBjZWxsO1xuXHR9KTtcbn07XG5cbmNoYW1iZXIuZ2V0Q2VsbFVuZGVyQ3Vyc29yID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiB0aGlzLm1hdHJpeFtjdXJzb3Iucm93XVtjdXJzb3IuY29sdW1uXTtcbn07XG5cbmNoYW1iZXIucmVuZGVyID0gZnVuY3Rpb24oKSB7XG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3NjZW5lJyk7XG5cdGVsZW1lbnQuaW5uZXJIVE1MID0gY2hhbWJlci5tYXRyaXgubWFwKGZ1bmN0aW9uKGFycmF5KSB7XG5cdFx0YXJyYXkgPSBhcnJheS5tYXAoZnVuY3Rpb24oY2VsbCkge1xuXHRcdFx0Y2VsbC5pc1VuZGVyQ3Vyc29yID0gY2VsbC5yb3cgPT09IGN1cnNvci5yb3cgJiYgY2VsbC5jb2x1bW4gPT09IGN1cnNvci5jb2x1bW47XG4gICAgICAgICAgICBjZWxsID0gY2VsbC50b1N0cmluZyhjaGFtYmVyLmNvbmZpZ3VyYXRpb24pO1xuICAgICAgICAgICAgcmV0dXJuIGNlbGw7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGFycmF5LmpvaW4oJycpO1xuXHR9KS5qb2luKCc8YnI+Jyk7XG59O1xuXG5jaGFtYmVyLmFjdE9uQ3Vyc29yID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMudHVycmV0cy5mb3JFYWNoKGZ1bmN0aW9uKHR1cnJldCkge1xuXHRcdHR1cnJldC5maW5kQW5kVHJ5VG9LaWxsKGN1cnNvciwgY2hhbWJlcik7XG5cdH0pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjaGFtYmVyO1xuIiwidmFyIGNvbW1hbmRzID0ge30sXG4gICAgbWFpbkZ1bmN0aW9uLFxuICAgIHByaW50VGV4dCA9IHJlcXVpcmUoJy4vcHJpbnQuanMnKTtcbm1vZHVsZS5leHBvcnRzID0gY29tbWFuZHM7XG5cbmNvbW1hbmRzWydjaGFtYmVyIChcXFxcZCspJ10gPSBmdW5jdGlvbihjaGFtYmVyTnVtYmVyKSB7XG4gICAgdmFyIHhtbGh0dHAgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICB4bWxodHRwLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoeG1saHR0cC5yZWFkeVN0YXRlICE9PSA0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRBY3Rpb24gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWxlcnQoeG1saHR0cC5zdGF0dXMpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAnMjAwJzogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5jaGFtYmVyID0gY2hhbWJlck51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1haW5GdW5jdGlvbihKU09OLnBhcnNlKHhtbGh0dHAucmVzcG9uc2VUZXh0KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvblsnNDA0J10oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJzQwNCc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuYWxlcnQoJ1RoaXMgaXMgdGhlIGxhc3QgY2hhbWJlciBhdCB0aGlzIG1vbWVudC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnTmV4dCB5b3UgYXJlIGdvaW5nIHRvIGJlIHJlZGlyZWN0ZWQgdG8gdGhlIHJlcG8gb2YgdGhpcyBnYW1lLiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdMZXQgbWUga25vdyB5b3VyIGZhdm9yaXRlIFZJTSBmZWF0dXJlcyB3aGljaCBhcmUgbWlzc2luZy4nKTtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnaHR0cHM6Ly9naXRodWIuY29tL2hlcm1hbnlhL3ZpbS1leHBlcmltZW50cyc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVt4bWxodHRwLnN0YXR1c10gfHwgZGVmYXVsdEFjdGlvbjtcbiAgICAgICAgYWN0aW9uKCk7XG5cbiAgICB9O1xuICAgIGNoYW1iZXJOdW1iZXIgPSBjaGFtYmVyTnVtYmVyIHx8IGxvY2FsU3RvcmFnZS5jaGFtYmVyIHx8IDA7XG4gICAgeG1saHR0cC5vcGVuKCdHRVQnLCAnLi9jaGFtYmVycy8nICsgY2hhbWJlck51bWJlciArICcuanNvbicsIHRydWUpO1xuICAgIHhtbGh0dHAuc2VuZCgpO1xufTtcblxuY29tbWFuZHNbJ3NldCBudW1iZXInXSA9IGZ1bmN0aW9uKCkge1xuICAgIHJlcXVpcmUoJy4vY2hhbWJlci5qcycpLmNvbmZpZ3VyYXRpb25bJ2Rpc3BsYXkgbGluZSBudW1iZXJzJ10gPSB0cnVlO1xuICAgIHJlcXVpcmUoJy4vY2hhbWJlci5qcycpLnJlbmRlcigpO1xufTtcbmNvbW1hbmRzWydzZXQgbnUnXSA9IGNvbW1hbmRzWydzZXQgbnVtYmVyJ107XG5cbmNvbW1hbmRzWydzZXQgbm9udW1iZXInXSA9IGZ1bmN0aW9uKCkge1xuICAgIHJlcXVpcmUoJy4vY2hhbWJlci5qcycpLmNvbmZpZ3VyYXRpb25bJ2Rpc3BsYXkgbGluZSBudW1iZXJzJ10gPSBmYWxzZTtcbiAgICByZXF1aXJlKCcuL2NoYW1iZXIuanMnKS5yZW5kZXIoKTtcbn07XG5jb21tYW5kc1snc2V0IG5vbnUnXSA9IGNvbW1hbmRzWydzZXQgbm9udW1iZXInXTtcblxuY29tbWFuZHNbJ2Nha2UgaXMgYSBsaWUnXSA9IGZ1bmN0aW9uKCkge1xuICAgIHJlcXVpcmUoJy4vY2hhbWJlci5qcycpLmNvbmZpZ3VyYXRpb25bJ2tpbGxpbmcgbW9kZSBvbiddID0gdHJ1ZTtcbiAgICBwcmludFRleHQoWycnLCdOb3cgeW91IGFyZSBnb2luZyB0byBkaWUuIEV2ZXJ5IHRpbWUuJywnJ10pO1xufTtcblxuY29tbWFuZHMubG9hZE5leHRDaGFtYmVyID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5leHRDaGFtYmVyTnVtYmVyID0gTnVtYmVyKGxvY2FsU3RvcmFnZS5jaGFtYmVyKSArIDE7XG4gICAgY29tbWFuZHNbJ2NoYW1iZXIgKFxcXFxkKyknXShuZXh0Q2hhbWJlck51bWJlcik7XG59O1xuXG5jb21tYW5kc1snaW5pdGlhbGl6ZSBjaGFtYmVyJ10gPSBmdW5jdGlvbihtYWluKSB7XG4gICAgbWFpbkZ1bmN0aW9uID0gbWFpbjtcbiAgICBjb21tYW5kc1snY2hhbWJlciAoXFxcXGQrKSddKCk7XG59O1xuIiwidmFyIGNvbW1hbmRzID0gcmVxdWlyZSgnLi9jb21tYW5kcy5qcycpLFxuICAgIHByaW50VGV4dCA9IHJlcXVpcmUoJy4vcHJpbnQuanMnKTtcbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHNjb3JlOiAwLFxuICAgIGFjdE9uQ3VycmVudENlbGw6IGZ1bmN0aW9uKGNoYW1iZXIpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMsXG4gICAgICAgICAgICBjZWxsID0gY2hhbWJlci5nZXRDZWxsVW5kZXJDdXJzb3IoKSxcbiAgICAgICAgICAgIGFjdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAnKic6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmNoYXJhY3RlciA9ICcgJztcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnNjb3JlKys7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnTyc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjdXJzb3IuaGFzQ29tcGxldGVkTGV2ZWwgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY29uZ3JhdHVsYXRpb25NZXNzYWdlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgJzAnOiAnWW91IGRpZCBpdCwgSSBhbSBib3JlZCB3YXRjaGluZyB5b3UuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICcxJzogJ09ubHkgb25lIHBhdGhldGljIHN0YXI/JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICcyJzogJ0RpZCB5b3UgZXZlbiB0cnk/J1xuICAgICAgICAgICAgICAgICAgICB9W2N1cnNvci5zY29yZV0gfHwgJ1NhdGlzZnlpbmcgcGVyZm9ybWFjZS4nO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByaW50VGV4dChbJycsIGNvbmdyYXR1bGF0aW9uTWVzc2FnZSwgJyddKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1hbmRzLmxvYWROZXh0Q2hhbWJlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnJic6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmlzRGVhY3RpdmF0ZWRUdXJyZXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmNoYXJhY3RlciA9ICcgPGRpdiBjbGFzcz1cImRlYWN0aXZhdGVkLXR1cnJldFwiPiY8L2Rpdj4nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1bY2VsbC5jaGFyYWN0ZXJdO1xuICAgICAgICBpZiAoIWNlbGwuaXNUZXh0ICYmIGFjdGlvbikge1xuICAgICAgICAgICAgYWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHJlc2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5oYXNDb21wbGV0ZWRMZXZlbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnNjb3JlID0gMDtcbiAgICAgICAgdGhpcy5mb3JnZXRDb2x1bW5Gb3JWZXJ0aWNhbE1vdmVtZW50KCk7XG4gICAgfSxcbiAgICBzZXRQb3NpdGlvbkZyb206IGZ1bmN0aW9uKGFub3RoZXJPYmplY3QpIHtcbiAgICAgICAgdGhpcy5jb2x1bW4gPSBhbm90aGVyT2JqZWN0LmNvbHVtbjtcbiAgICAgICAgdGhpcy5yb3cgPSBhbm90aGVyT2JqZWN0LnJvdztcbiAgICB9LFxuICAgIHJlbWVtYmVyQ29sdW1uRm9yVmVydGljYWxNb3ZlbWVudDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy5yZW1lbWJlcmVkQ29sdW1uRm9yVmVydGljYWxNb3ZlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5yZW1lbWJlcmVkQ29sdW1uRm9yVmVydGljYWxNb3ZlbWVudCA9IHRoaXMuY29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBmb3JnZXRDb2x1bW5Gb3JWZXJ0aWNhbE1vdmVtZW50OiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucmVtZW1iZXJlZENvbHVtbkZvclZlcnRpY2FsTW92ZW1lbnQ7XG4gICAgfSxcbiAgICBzYXZlQ3VycmVudFBvc2l0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5zYXZlZENvbHVtbiA9IHRoaXMuY29sdW1uO1xuICAgICAgICB0aGlzLnNhdmVkUm93ID0gdGhpcy5yb3c7XG4gICAgfSxcbiAgICByZXN0b3JlVG9TYXZlZFBvc2l0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5jb2x1bW4gPSB0aGlzLnNhdmVkQ29sdW1uO1xuICAgICAgICB0aGlzLnJvdyA9IHRoaXMuc2F2ZWRSb3c7XG4gICAgfVxufTtcbiIsInZhciBjb21tYW5kcyA9IHJlcXVpcmUoJy4vY29tbWFuZHMuanMnKTtcblxudmFyIGNvbW1hbmRMaW5lID0ge1xuXHRleGVjdXRlOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2l2ZW5Db21tYW5kID0gdGhpcy5lbGVtZW50LnZhbHVlLnNsaWNlKDEpOyAvLyBzdHJpcCBjb2xvblxuXHRcdE9iamVjdC5rZXlzKGNvbW1hbmRzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0dmFyIG1hdGNoZXMgPSBnaXZlbkNvbW1hbmQubWF0Y2gobmV3IFJlZ0V4cChrZXkpKTtcblx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdGNvbW1hbmRzW2tleV0uYXBwbHkodGhpcywgbWF0Y2hlcy5zbGljZSgxKSk7IC8vIHN0cmlwIG1hdGNoaW5nIGxpbmVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufTtcblxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG5cdGNvbW1hbmRMaW5lLmVsZW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NvbW1hbmQtbGluZScpO1xuXHRjb21tYW5kTGluZS5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBmdW5jdGlvbigpIHtcblx0XHRpZiAoY29tbWFuZExpbmUuZWxlbWVudC52YWx1ZSkge1xuXHRcdFx0Y29tbWFuZExpbmUuZWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fSk7XG5cdGNvbW1hbmRMaW5lLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBmdW5jdGlvbihlKSB7XG5cdFx0aWYgKGUud2hpY2ggPT09IDEzKSB7XG5cdFx0XHRjb21tYW5kTGluZS5leGVjdXRlKCk7XG5cdFx0XHRjb21tYW5kTGluZS5kZWFjdGl2YXRlKCk7XG5cdFx0fVxuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdH0pO1xuXHRjb21tYW5kTGluZS5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgZnVuY3Rpb24oKSB7XG5cdFx0aWYgKGNvbW1hbmRMaW5lLmVsZW1lbnQudmFsdWUgPT09ICcnKSB7XG5cdFx0XHRjb21tYW5kTGluZS5kZWFjdGl2YXRlKCk7XG5cdFx0fVxuXHR9KTtcblx0Y29tbWFuZExpbmUuYWN0aXZhdGUgPSBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmVsZW1lbnQuZm9jdXMoKTtcblx0fTtcblx0Y29tbWFuZExpbmUuZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZWxlbWVudC52YWx1ZSA9ICcnO1xuXHRcdHRoaXMuZWxlbWVudC5ibHVyKCk7XG5cdH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY29tbWFuZExpbmU7IiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdGZyb21BcnJheU9mU3RyaW5nczogZnVuY3Rpb24gKGFycmF5T2ZTdHJpbmdzKSB7XG5cdFx0dGhpcy5tYXRyaXggPSBhcnJheU9mU3RyaW5ncy5tYXAoZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gc3RyaW5nLnNwbGl0KCcnKTtcblx0XHR9KTtcblx0fSxcblx0bWFwOiBmdW5jdGlvbihmbikge1xuXHRcdHJldHVybiB0aGlzLm1hdHJpeC5tYXAoZnVuY3Rpb24oYXJyYXksIHJvdykge1xuXHRcdFx0cmV0dXJuIGFycmF5Lm1hcChmdW5jdGlvbihpdGVtLCBjb2x1bW4pIHtcblx0XHRcdFx0cmV0dXJuIGZuKGl0ZW0sIHJvdywgY29sdW1uKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9LFxuXHRnZXRDb29yZGluYXRlc09mOiBmdW5jdGlvbiAodGhpbmdUb0ZpbmQpIHtcblx0XHR2YXIgcHJlZGljYXRlO1xuXHRcdGlmICh0eXBlb2YgdGhpbmdUb0ZpbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRwcmVkaWNhdGUgPSBmdW5jdGlvbihzdHJpbmcsIGFub3RoZXJTdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHN0cmluZyA9PT0gYW5vdGhlclN0cmluZztcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdGhpbmdUb0ZpbmQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRwcmVkaWNhdGUgPSBmdW5jdGlvbih0aGluZ1RvRmluZCwgYW5vdGhlck9iamVjdCkge1xuXHRcdFx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpbmdUb0ZpbmQpLmZpbHRlcihmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpbmdUb0ZpbmRba2V5XSAhPT0gYW5vdGhlck9iamVjdFtrZXldO1xuXHRcdFx0XHR9KS5sZW5ndGggPT09IDA7XG5cblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1hdHJpeC5yZWR1Y2UoZnVuY3Rpb24oZm91bmQsIGFycmF5LCByb3cpIHtcblx0XHRcdGFycmF5LmZvckVhY2goZnVuY3Rpb24oY2VsbCwgY29sdW1uKSB7XG5cdFx0XHRcdGlmIChwcmVkaWNhdGUodGhpbmdUb0ZpbmQsIGNlbGwpKSB7XG5cdFx0XHRcdFx0Zm91bmQucHVzaCh7XG5cdFx0XHRcdFx0XHRyb3c6IHJvdyxcblx0XHRcdFx0XHRcdGNvbHVtbjogY29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZvdW5kO1xuXHRcdH0sIFtdKTtcblx0fVxufTsiLCJ2YXIgY29uc29sZTtcbmlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGNvbnNvbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29uc29sZScpO1xufVxuXG52YXIgcHJpbnRUZXh0ID0gZnVuY3Rpb24odGV4dCkge1xuICAgIHZhciBsaW5lID0gdGV4dC5zaGlmdCgpO1xuICAgIGlmIChsaW5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQgKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY29uc29sZS5pbm5lckhUTUwgKz0gdGV4dC5ieSArIGxpbmUgKyAnPGJyPic7XG4gICAgICAgICAgICBjb25zb2xlLnNjcm9sbFRvcCArPTEwMDtcbiAgICAgICAgICAgIHByaW50VGV4dCh0ZXh0KTtcbiAgICAgICAgfSwgbGluZS5sZW5ndGggKiA0MCk7XG4gICAgfVxuXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRleHQpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodGV4dCkpIHtcbiAgICAgICAgdGV4dCA9IFt0ZXh0XTtcbiAgICB9XG4gICAgdGV4dC5ieSA9IHRleHQuYnkgPyB0ZXh0LmJ5ICsgJz4gJyA6ICcnO1xuICAgIHByaW50VGV4dCh0ZXh0KTtcbn07XG4iLCJ2YXIgcHJpbnRUZXh0ID0gcmVxdWlyZSgnLi9wcmludC5qcycpO1xubW9kdWxlLmV4cG9ydHMgPSB7XG5cdGZpbmRBbmRUcnlUb0tpbGw6IGZ1bmN0aW9uKGN1cnNvciwgY2hhbWJlcikge1xuXHQvLyBhZGQgc29tZSBmdW5ueSBleGN1c2UgZm9yIHRoZSBraWxsIGZyb20gdHVycmV0XG5cdFx0aWYgKHRoaXMuaXNTaG9vdGluZyB8fCB0aGlzLmNlbGwuaXNEZWFjdGl2YXRlZFR1cnJldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2YXIgdHVycmV0ID0gdGhpcyxcblx0XHRyaXNlID0gY3Vyc29yLnJvdyAtIHR1cnJldC5yb3csXG5cdFx0cnVuID0gY3Vyc29yLmNvbHVtbiAtIHR1cnJldC5jb2x1bW4sXG5cdFx0Y291bnQgPSBNYXRoLm1heChNYXRoLmFicyhyaXNlKSwgTWF0aC5hYnMocnVuKSksXG5cdFx0dG90YWwgPSBjb3VudCxcblx0XHRwYXRoID0gW10sXG5cdFx0Y2VsbDtcblx0XHRpZiAoIXJpc2UgJiYgIXJ1bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8PSBjb3VudDsgaSsrKSB7XG5cdFx0XHRjZWxsID0gY2hhbWJlci5tYXRyaXhbTWF0aC5yb3VuZCh0dXJyZXQucm93ICsgcmlzZSooaS90b3RhbCkpXVtNYXRoLnJvdW5kKHR1cnJldC5jb2x1bW4gKyBydW4qKGkvdG90YWwpKV07XG5cdFx0XHRpZiAoIWNlbGwuaXNMYXplckJlYW0oKSAmJiBjZWxsLmlzQmxvY2tpbmcoKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChjZWxsICE9PSB0dXJyZXQuY2VsbCAmJiBwYXRoLmluZGV4T2YoY2VsbCkgPT09IC0xKSB7XG5cdFx0XHRcdHBhdGgucHVzaChjZWxsKTtcblx0XHRcdH1cblx0XHRcdGlmIChjZWxsLnJvdyA9PT0gY3Vyc29yLnJvdyAmJiBjZWxsLmNvbHVtbiA9PT0gY3Vyc29yLmNvbHVtbikge1xuXHRcdFx0XHR0dXJyZXQudHJ5VG9LaWxsKGN1cnNvciwgY2hhbWJlciwgcGF0aCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0dHJ5VG9LaWxsOiBmdW5jdGlvbihjdXJzb3IsIGNoYW1iZXIsIHBhdGgpIHtcblx0XHR2YXIgdHVycmV0ID0gdGhpcztcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGlzQ3Vyc29yVW5kZXJMYXplciA9ICFwYXRoLmV2ZXJ5KGZ1bmN0aW9uKGNlbGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIWNlbGwuaXNVbmRlckN1cnNvcjtcbiAgICAgICAgICAgIH0pO1xuXHRcdFx0aWYgKGlzQ3Vyc29yVW5kZXJMYXplcikge1xuXHRcdFx0XHR0dXJyZXQuaXNTaG9vdGluZyA9IHRydWU7XG5cdFx0XHRcdHBhdGguZm9yRWFjaChmdW5jdGlvbihjZWxsKSB7XG5cdFx0XHRcdFx0Y2VsbC5pc1VuZGVyVHVycmV0RmlyZSA9IHRydWU7XG5cdFx0XHRcdH0pO1xuICAgICAgICAgICAgICAgIHZhciBtZXNzYWdlID0gJ3R1cnJldD4gJyArIFtcbiAgICAgICAgICAgICAgICAgICAgJ0kgZGlkIG5vdCBtZWFuIHRvLicsXG4gICAgICAgICAgICAgICAgICAgICdUaGV5IG1hZGUgbWUgZG8gdGhpcy4nLFxuICAgICAgICAgICAgICAgICAgICAnSSBhbSB0cnVsbHkgc29ycnkuJyxcbiAgICAgICAgICAgICAgICAgICAgJ1NvbWV0aW1lcyBJIGNhbiBub3QgaGVscCBteXNlbGYuJyxcbiAgICAgICAgICAgICAgICAgICAgJ1dhdGNoIG91dC4nLFxuICAgICAgICAgICAgICAgICAgICAnUGxlYXNlIGRvIG5vdCB0aGluayBsZXNzIG9mIG1lLidcbiAgICAgICAgICAgICAgICBdW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDMpXTtcbiAgICAgICAgICAgICAgICBwcmludFRleHQobWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlcXVpcmUoJy4vY2hhbWJlci5qcycpLmNvbmZpZ3VyYXRpb25bJ2tpbGxpbmcgbW9kZSBvbiddKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnNvci5zZXRQb3NpdGlvbkZyb20ocmVxdWlyZSgnLi9jaGFtYmVyLmpzJykuc3Bhd25Qb3NpdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuXHRcdFx0XHRjaGFtYmVyLnJlbmRlcigpO1xuXHRcdFx0XHR3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0XHR0dXJyZXQuaXNTaG9vdGluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHBhdGguZm9yRWFjaChmdW5jdGlvbihjZWxsKSB7XG5cdFx0XHRcdFx0XHRjZWxsLmlzVW5kZXJUdXJyZXRGaXJlID0gZmFsc2U7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y2hhbWJlci5yZW5kZXIoKTtcblx0XHRcdFx0fSwgMTAwMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0dXJyZXQuZmluZEFuZFRyeVRvS2lsbChjdXJzb3IsIGNoYW1iZXIpO1xuXHRcdFx0fVxuXHRcdH0sIDEwMDApO1xuXHR9XG59O1xuIl19
