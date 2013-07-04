var spawn = require('child_process').spawn;

function Git(repoDir) {
	this.repoDir = repoDir;
};

Git.prototype.add = function(files, callback) {
	return this._exec('add', files, callback);
};

Git.prototype.commit = function(message, callback) {
	return this._exec('commit', [ '-m', message ], callback);
};

Git.prototype.push = function(branch, callback) {
	return this._exec('push', [ '-u', 'origin', branch ], callback);
};

Git.prototype.fetch = function(branch, callback) {
	return this._exec('fetch', [ 'origin', branch + ':' + branch ], callback);
};

Git.prototype.pull = function(callback) {
	return this._exec('pull', [ 'origin' ], callback);
};

Git.prototype.clone = function(repo, outDir, callback) {
	var proc = spawn('git', [ 'clone', repo, outDir ]);
	
	var body = '';
	proc.stdout.on('data', function(r) {
		body += r.toString();
	});
	proc.stderr.on('data', function(r) {
		body += r.toString();
	});
	proc.on('close', function(code) {
		if(callback)
			callback(body);
	});
	//return this.exec('clone', [ repo ], callback);
};

Git.prototype._exec = function(cmd, args, callback) {
	var f = [ cmd ];
	if(args) {
		f = f.concat(args);
	}
	
	var opts = { };
	
	if(cmd != 'clone')
		opts.cwd = this.repoDir;
	
	var proc = spawn('git', f, opts);
	
	var body = '';
	proc.stdout.on('data', function(r) {
		body += r.toString();
	});
	proc.stderr.on('data', function(r) {
		body += r.toString();
	});
	proc.on('close', function(code) {
		if(callback)
			callback(body);
	});
	return proc;
};

module.exports = Git;