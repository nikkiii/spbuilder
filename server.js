var http = require('http');
var querystring = require('querystring');
var fs = require('fs');

var spawn = require('child_process').spawn;

http.createServer(function (req, res) {
	var body = '';
	req.on('data', function(chunk) {
		body += chunk.toString();
	});
	
	req.on('end', function() {
		var data = JSON.parse(querystring.parse(body).payload);
		
		parsePush(data);
		
		// This is just dummy data to keep github's request happy
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('Text');
	});
}).listen(9615);

function parsePush(data) {
	var files = [];
	// Check for .sp files in head commit first
	if(data.head_commit) {
		var commit = data.head_commit;
		var f = commit.added.concat(commit.modified);
		for(var i = 0; i < f.length; i++) {
			var l = f[i];
			if(files.indexOf(l) == -1 && l.indexOf('.sp') != -1)
				files.push(l);
		}
	}
	// Check for .sp files not listed in head commit which were changed.
	for(var i = 0; i < data.commits.length; i++) {
		var commit = data.commits[i];
		
		var f = commit.added.concat(commit.modified);
		for(var i = 0; i < f.length; i++) {
			var l = f[i];
			if(files.indexOf(l) == -1 && l.indexOf('.sp') != -1)
				files.push(l);
		}
	}
	// List files for now
	console.log('Files to compile : ' + files.join(', '));
	
	if(files.length > 0) {
		// Update repo
		console.log('Pulling data from repo');
		var repoPath = '/build/' + data.repository.name;
		var git = spawn('git', ['--git-dir=/build/' + repoPath + '/.git', '--work-tree=' + repoPath, 'pull']);
		git.on('close', function(code) {
			build(data.repository, files);
		});
	}
}

function build(repo, files) {
	var repoPath = '/build/' + repo.name;
	
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
		
		var name = f.substring(f.lastIndexOf('/')+1, f.lastIndexOf('.'));
		
		var sourceDir = repoPath + '/' + f.substring(0, f.lastIndexOf('/'));
		var sourcePath = repoPath + '/' + f;
		var compiledPath = repoPath + '/plugins/' + name + '.smx';
		
		if(fs.existsSync(sourcePath)) {
			compile(sourceDir, repoPath + '/' + f, compiledPath, function(res) {
				compiled.push(res);
				done++;
				if(done >= totalFiles) {
					pushToRepo(repoPath, compiled);
				}
			});
		} else {
			totalFiles--;
		}
	}
}

function compile(sourcePath, sourceFile, outFile, callback) {
	console.log('Compiling ' + sourceFile + ' to ' + outFile + '...');
	var args = [sourceFile, '-o' + outFile];
	if(fs.existsSync(sourcePath + '/include')) {
		args.push('-i' + sourcePath + '/include');
	}
	var comp = spawn('/build/executables/sourcemod/spcomp', args);
	comp.stdout.on('data', function (data) {
	  console.log('' + data);
	});
	comp.on('close', function(code) {
		callback(outFile);
	});
}

function pushToRepo(repoPath, compiled) {
	var add = spawn('git', ['--git-dir=' + repoPath + '/.git', '--work-tree=' + repoPath, 'add'].concat(compiled));
	add.on('close', function(code) {
		console.log('Committing...');
		spawn('git', ['--git-dir=' + repoPath + '/.git', '--work-tree=' + repoPath, 'commit', '-m', 'Compiled files']).on('close', function(code) {
			console.log('Pushing...');
			spawn('git', ['--git-dir=' + repoPath + '/.git', '--work-tree=' + repoPath, 'push', '-u', 'origin', 'master']).on('close', function(code) {
				console.log('Pushed compiled files to repo.');
			});
		});
	});
}