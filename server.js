var http = require('http');
var querystring = require('querystring');
var fs = require('fs');
var Git = require('./git.js');

var config = require('./config.js');

var spawn = require('child_process').spawn;

http.createServer(function (req, res) {
	if(req.method == 'POST') {
		var body = '';
		req.on('data', function(chunk) {
			body += chunk.toString();
		});
		
		req.on('end', function() {
			var payload = querystring.parse(body).payload;
			var data = JSON.parse(payload);
			
			// This is just dummy data to keep github's request happy
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.end('Text');
			
			if(config.validowners.indexOf(data.repository.owner.name) == -1) {
				console.log('Possible misconfigured settings/attack? Repository owner is ' + data.repository.owner.name);
			} else {
				parsePush(data);
			}
		});
	} else {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('Response');
	}
}).listen(9615);

function parsePush(data) {
	console.log('Processing commit for ' + data.repository.owner.name + '/' + data.repository.name);
	var files = [];
	// Check for .sp files in head commit first
	if(data.head_commit) {
		var commit = data.head_commit;
		var f = commit.added.concat(commit.modified);
		for(var i = 0; i < f.length; i++) {
			var l = f[i];
			if(l && files.indexOf(l) == -1 && l.indexOf('.sp') != -1)
				files.push(l);
		}
	}
	// Check for .sp files not listed in head commit which were changed.
	for(var i = 0; i < data.commits.length; i++) {
		var commit = data.commits[i];
		
		var f = commit.added.concat(commit.modified);
		
		for(var x = 0; x < f.length; x++) {
			var l = f[x];
			if(l && files.indexOf(l) == -1 && l.indexOf('.sp') != -1)
				files.push(l);
		}
	}
	// List files for now
	
	if(files.length > 0) {
		console.log('Files to compile : ' + files.join(', '));
		// Update repo
		console.log('Pulling data from repo');
		var repoPath = config.basePath + '/' + data.repository.name;
		
		var git = new Git(repoPath);
		
		if(!fs.existsSync(repoPath)) {
			git.clone('git@github.com:' + data.repository.owner.name + '/' + data.repository.name + '.git', function(res) {
				console.log(res);
				build(git, data.repository, files);
			});
		} else {
			git.pull(function(res) {
				console.log(res);
				build(git, data.repository, files);
			});
		}
	} else {
		console.log('No files to update.');
	}
}

function build(git, repo, files) {
	var repoPath = config.basePath + '/' + repo.name;
	
	// Check for the plugin directory
	if(!fs.existsSync(repoPath + '/plugins')) {
		fs.mkdirSync(repoPath + '/plugins');
	}
	
	console.log('Building...');
	
	var totalFiles = files.length;
	var done = 0;
	
	var compiled = [ ];
	for(var i = 0; i < files.length; i++) {
		var f = files[i];
		
		var name = f.substring(f.indexOf('/')+1, f.lastIndexOf('.'));
		var dir = f.substring(0, f.lastIndexOf('/'));
		
		var sourceDir = repoPath + '/' + dir;
		var sourcePath = repoPath + '/' + f;
		var compiledPath = repoPath + '/plugins/' + name + '.smx';
		
		if(fs.existsSync(sourcePath) && isValidSpFile(sourcePath)) {
			compile(sourceDir, repoPath + '/' + f, compiledPath, function(res) {
				compiled.push(res);
				done++;
				if(done >= totalFiles) {
					pushToRepo(git, repoPath, compiled);
				}
			});
		} else {
			totalFiles--;
		}
	}
}

function isValidSpFile(file) {
	if(fs.existsSync(file)) {
		var contents = fs.readFileSync(file);
		contents = contents.toString('utf8');
		// We only want 'source plugins', meaning any sub modules will be ignored unless they are their own plugin.
		if(contents.indexOf('myinfo') != -1) {
			return true;
		}
	}
	return false;
}

function compile(sourcePath, sourceFile, outFile, callback) {
	console.log('Compiling ' + sourceFile + ' to ' + outFile + '...');
	var args = [sourceFile, '-o' + outFile];
	if(fs.existsSync(sourcePath + '/include')) {
		args.push('-i' + sourcePath + '/include');
	}
	var comp = spawn(config.basePath + '/executables/sourcemod/spcomp', args);
	comp.stdout.on('data', function (data) {
	  console.log('' + data);
	});
	comp.on('close', function(code) {
		// TODO log?
		callback(outFile);
	});
}

function pushToRepo(git, repoPath, compiled) {
	git.add(compiled, function(res) {
		console.log(res);
		console.log('Committing...');
		git.commit('Compiled files', function(res) {
			console.log(res);
			console.log('Pushing...');
			git.push('master', function(res) {
				console.log(res);
				console.log('Pushed compiled files to repo.');
			});
		});
	});
}