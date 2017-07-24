'use strict';
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

const port = 8000;
const users_dir = '/home/kishlaya/users/';
const default_notebook = 'Getting-Started.ipynb';
const notebook_address = '127.0.0.1';
const base_url = '/user/';

var notebooks = {};
var portlist = {};

// Express setings
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());
app.set('view engine', 'pug');
app.set('views', './views');

// Express routes
app.get('/', function(req, res) {
    // res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    // res.header("Pragma", "no-cache");
    // res.header("Expires", 0);
    res.render('index');
});

app.post('/launch', function(req, res) {
    let userID = req.body.user;
    let password = req.body.password;
    if (!userID) {
        res.render('error');
    }
    else if (notebooks.hasOwnProperty(userID)) {
        res.render('notebook', {
            user: userID,
            running: true,
            baseUrl: "http://" + notebook_address + ":" + notebooks[userID].port + base_url + userID
        });
    }
    else {
        // Create a workplace for user
        let dir = users_dir + userID;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            exec('cp ' + default_notebook + ' ' + dir, function(err, stderr, stdout) {
                if (err) {
                    return console.error(err);
                }
            });
        }

        // Setup user notebook process and port
        notebooks[userID] = {process: '', port: ''};

        // Get free port for user
        notebooks[userID].port = getPort();


        // Generate hashed password for user
        genPassword(password, function(err, hashed_password) {
            if (err) {
                console.log("Could not generate user password");
            } else {
                // Generate configurations for the customized notebook environment
                let config = getConfig(userID, hashed_password);

                // Launch jupyter notebook
                notebooks[userID].process = spawn('jupyter', config);

                // Uncomment this for logs from jupyter
                notebooks[userID].process.stdout.on('data', function(data) {
                    console.log('' + data);
                });
                notebooks[userID].process.stderr.on('data', function(data) {
                    console.error('' + data);
                });
            }
        });

        // Render launch webpage
        res.render('notebook', {
            user: userID,
            running: false,
            baseUrl: 'http://' + notebook_address + ':' + notebooks[userID].port + base_url + userID
        });
    }
});

app.get('/exit', function(req, res) {
    let userID = req.query.user;
    if (notebooks.hasOwnProperty(userID)) {
        portlist[notebooks[userID].port] = false;
        notebooks[userID].process.stdin.pause();
        notebooks[userID].process.kill();
        delete notebooks[userID];
    }
    res.redirect('/');
});

app.listen(port, function() {
	console.log("Listening on port " + port + "...");
});

// Helper functions

var getConfig = function(userID, password, port, dir) {
    port = port ? port : notebooks[userID].port;
    dir = dir ? dir :  users_dir + userID;

    return [
        'notebook',
        '--ip=' + notebook_address,
        '--port=' + port,
        '--MultiKernelManager.default_kernel_name=julia-0.5',
        '--NotebookApp.allow_root=False',
        '--NotebookApp.base_url=' + base_url + userID,
        '--NotebookApp.default_url=/notebooks/' + default_notebook,
        '--NotebookApp.port_retries=0',
        '--notebook-dir=' + dir,
        '--NotebookApp.password=' + password,
        '--NotebookApp.password_required=True',
        // '--ContentsManager.untitled_directory="Untitled Folder"',
        // '--ContentsManager.untitled_file="untitled"',
        // '--ContentsManager.untitled_notebook="Untitled"'
    ];
};

function getPort(userID) {
    for(var i=12000;;i++) {
        if (!portlist[i]) {
            portlist[i] = true;
            return i;
        }
    }
}

function genPassword(password, callback) {
    let command = "/usr/bin/python3 -c 'from notebook.auth import passwd; print(passwd(\"" + password + "\"))'";
    exec(command, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.substring(0, data.length-1));
        }
    });
}
