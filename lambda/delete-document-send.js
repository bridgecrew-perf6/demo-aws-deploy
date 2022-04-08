'use strict';
const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient({
    region: 'ap-northeast-1'
});
exports.handler = (event, context, callback) => {
    var tableName = (event.context.stage == "prod") ? {
        "send": process.env.CC_TABLE_SEND,
        "receiver": process.env.CC_TABLE_RECEIVER,
        "keys": process.env.CC_TABLE_KEYS,
        "user": process.env.CC_USER_TABLE
    } : {
        "send": process.env.CC_TABLE_SEND_DEV,
        "receiver": process.env.CC_TABLE_RECEIVER_DEV,
        "keys": process.env.CC_TABLE_KEYS_DEV,
        "user": process.env.CC_USER_TABLE_DEV
    };
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
    keyGet(tableName.user, "id", event.context['cognito-identity-id']).then((userData) => { // Get the currentId to check if the user is switching.
        var currentId = event.context['cognito-identity-id']
        if (userData.Items[0].currentId) {
            currentId = userData.Items[0].currentId
        }
        console.log("currentId is:" + currentId)
        keyGet(tableName.keys, "key", event['body-json'].key).then((data) => {
            var res = data.Items[0];
            if (res.status === "concluded") {
                done(null, {
                    result: "invalid",
                    status: res.status
                });
                return null;
            }
            var params_send = {
                TableName: tableName.send,
                Key: {
                    "id": currentId,
                    "key": res.key
                },
                UpdateExpression: "set #status = :s, #timestamp = :t",
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#timestamp": "timestamp"
                },
                ExpressionAttributeValues: {
                    ":s": "deactive",
                    ":t": timestamp()
                }
            };
            var params_receiver = {
                TableName: tableName.receiver,
                // @dynamo cc${stageName}-document-receiver
                // receiver: primary key, key: sort key
                // "receiver": set updateReceiverTable function();
                Key: {
                    "key": res.key
                },
                UpdateExpression: "set #status = :s, #timestamp = :t",
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#timestamp": "timestamp"
                },
                ExpressionAttributeValues: {
                    ":s": "deactive",
                    ":t": timestamp()
                }
            };
            var params_keys = {
                TableName: tableName.keys,
                Key: {
                    "key": res.key
                },
                UpdateExpression: "set #status = :s, #timestamp = :t",
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#timestamp": "timestamp"
                },
                ExpressionAttributeValues: {
                    ":s": "deactive",
                    ":t": timestamp()
                }
            };
            var updateReceiverTable;
            if (typeof res.receiver === typeof []) {
                updateReceiverTable = res.receiver.map((val, index) => {
                    params_receiver.Key.receiver = val;
                    return new Promise((resolve, reject) => {
                        dynamo.update(params_receiver, function (err, data) {
                            console.log("UPDATE:" + params_receiver.TableName);
                            if (err) reject(err);
                            else resolve(data);
                        });
                    });
                });
            } else {
                params_receiver.Key.receiver = res.receiver;
                updateReceiverTable = function () {
                    return new Promise((resolve, reject) => {
                        dynamo.update(params_receiver, function (err, data) {
                            console.log("UPDATE:" + params_receiver.TableName);
                            if (err) reject(err);
                            else resolve(data);
                        });
                    });
                };
            }
            var updateSendTable = function () {
                return new Promise((resolve, reject) => {
                    dynamo.update(params_send, function (err, data) {
                        console.log("UPDATE:" + params_send.TableName);
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
            };
            var updateKeysTable = function () {
                return new Promise((resolve, reject) => {
                    dynamo.update(params_keys, function (err, data) {
                        console.log("UPDATE:" + params_keys.TableName);
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
            };
            updateSendTable()
            .then(updateReceiverTable)
            .then(updateKeysTable)
            .then(done(null, {
                result: "success"
            }));
        });
    });
};


var keyGet = (tableName, name, value) => {
    return new Promise((resolve, reject) => {
        var values = {
            ":val": value,
        };
        var param = {
            TableName: tableName,
            KeyConditionExpression: "#k = :val",
            ExpressionAttributeValues: values,
            ExpressionAttributeNames: {
                "#k": name
            }
        };
        dynamo.query(param, function(err, data) {
            if (err) reject(err);
            else resolve(data);
        });
    });
};


var timestamp = (expireday) => {
    process.env.TZ = 'Asia/Tokyo';
    var dt = new Date();
    if (expireday) {
        dt.setDate(dt.getDate() + expireday);
    }
    var year = dt.getFullYear();
    var month = dt.getMonth() + 1;
    var day = dt.getDate();
    var hour = dt.getHours();
    var min = dt.getMinutes();
    var sec = dt.getSeconds();
    if (month < 10) month = '0' + month;
    if (day < 10) day = '0' + day;
    if (hour < 10) hour = '0' + hour;
    if (min < 10) min = '0' + min;
    if (sec < 10) sec = '0' + sec;
    return String(year) + String(month) + String(day) + String(hour) + String(min) + String(sec);
};
