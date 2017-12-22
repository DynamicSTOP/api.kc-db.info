"use strict";

require('dotenv').config();

const app = require('express')(),
    Hashids = require('hashids'),
    redis = require("redis"),
    bodyParser = require('body-parser'),
    multer = require('multer'), // v1.0.5
    datapacker = require("./datapacker/datapacker.v1"),
    upload = multer(),
    expireAfter = 60 * 60 * 24 * 30 * 3; //3 months

const redisOptions = {
    host: process.env.APP_REDIS_HOST,
    port: process.env.APP_REDIS_PORT,
    db: process.env.APP_REDIS_DB,
};
let RedisClient = redis.createClient(redisOptions),
    hashIds = null;

let settings = {
    lastId: 1,
    min: 4
};

RedisClient.get("settings", (err, res) => {
    if (err !== null) {
        console.error(`can't read settings`);
        console.error(err);
        process.exit(1);
    }

    let stored = {};
    if (res !== null) {
        try {
            stored = JSON.parse(res);
        } catch (Err) {
            console.error(`corrupted settings`);
            console.log(stored);
            console.error(Err);
            process.exit(1);
        }
    }
    console.log(`stored settings-> ${JSON.stringify(stored)}`);
    Object.assign(settings, stored);
    hashIds = new Hashids(process.env.APP_SALT, settings.min);
    saveSettings().then(() => startApp());
});

function saveSettings() {
    return new Promise((res) => {
        RedisClient.set("settings", JSON.stringify(settings), () => {
            console.log(`settings saved -> ${JSON.stringify(settings)}`);
            res();
        });
    })
}

function startApp() {
    console.log(`Booting up app with ${JSON.stringify(settings)}`);

    app.use(bodyParser.json()); // for parsing application/json
    app.use(bodyParser.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

    app.use(function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, X-Requested-With');

        if ('OPTIONS' === req.method) {
            res.send(200);
        } else {
            next();
        }
    });

    app.get('/', (req, res) => {
        res.json({info: 'api endpoint for https://export.kc-db.info service'});
    });


    app.get('/list/ships/:id', (req, response) => {
        RedisClient.hgetall(`list:ships:${req.params.id}`, (err, res) => {
            if (err !== null) {
                console.error(`can't read list "list:${req.params.id}"`);
                console.error(err);
                response.status(500).json({error: "something bad happened on server"});
                return;
            }

            if (res === null) {
                response.status(404).json({error: "List is outdated or never existed. Or maybe db was wiped."});
                return;
            }

            //renew ttl
            RedisClient.expire(`list:ships:${req.params.id}`, expireAfter);

            response.json(res);
        });

    });

    app.post('/list/ships', upload.array(), (req, res) => {
        if (typeof req.body.data === "undefined" ||
            typeof req.body.data !== "string" ||
            req.body.data.length === 0
        ) {
            console.error(`Invalid data submitted from ${JSON.stringify(req.ip)} ${JSON.stringify(req.ips)}`);
            response.status(500).json({error: "Invalid data"});
            return;
        }

        try {
            datapacker._validate(req.body.data);
        } catch (err) {
            console.error(`Can't validate from ${JSON.stringify(req.ip)} ${JSON.stringify(req.ips)} error: ${err}`);
            res.status(500).json({error: "Invalid data format"});
            return;
        }

        settings.lastId++;
        const listId = hashIds.encode(settings.lastId);

        RedisClient.hset(`list:ships:${listId}`, "data", req.body.data);
        RedisClient.expire(`list:ships:${listId}`, expireAfter);

        console.log(`added ${listId}`);
        res.json({listId: listId});
    });

    app.use(function (req, res) {
        res.status(404);
        res.send({error: 'Not found'});
    });

    app.listen(process.env.APP_PORT);

    // https://stackoverflow.com/a/14032965
    process.stdin.resume();

    function exitHandler(options, err) {
        console.log(options, err);
        saveSettings().then(() => process.exit());
    }

    //do something when app is closing
    process.on('exit', exitHandler.bind(null, {cleanup: true}));

    //catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {exit: true}));

    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
    process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));

    //catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {exit: true}));
}