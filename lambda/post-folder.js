'use strict';
const crypto = require('crypto');
const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient({
    region: 'ap-northeast-1'
});
const lambda = new AWS.Lambda();
exports.handler = (event, context, callback) => {

    var tableName = (event.context.stage == "prod") ? process.env.CC_TABLE : process.env.CC_TABLE_DEV;
    var usertableName = (event.context.stage == "prod") ? process.env.CC_USER_TABLE : process.env.CC_USER_TABLE_DEV;
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
    var userExpressionAttributeValues = {
        ":val": event.context['cognito-identity-id']
    };
    var user_param = {
        TableName: usertableName,
        KeyConditionExpression: "#k = :val",
        ExpressionAttributeValues: userExpressionAttributeValues,
        ExpressionAttributeNames: {
            "#k": "id"
        }
    };
    // Get the currentId to check if the user is switching.
    dynamo.query(user_param, function (err, data) {
        var currentId = event.context['cognito-identity-id']
        if (data.Items[0].currentId) {
            currentId = data.Items[0].currentId
        }
        console.log("currentId is:" + currentId)
        var id = currentId;
        var foldername = event['body-json'].name;
        var parentfolderid = event['body-json'].parentfolderid;
        var time = timestamp();
        var _fid = time + id + foldername;
        var hash = crypto.createHash('sha256');
        hash.update(_fid);
        var digest = hash.digest('base64');
        var items = {
            "id": id,
            "createdtime": time,
            "folderid": digest,
            "foldername": foldername,
            "timestamp": time,
            "status": "active",
            "tab": event['body-json'].tab,
        };
        if (parentfolderid) items.parentfolderid = parentfolderid;
        var params = {
            TableName: tableName,
            Item: items
        };
        dynamo.put(params, done);
    });
};

var timestamp = () => {
    process.env.TZ = 'Asia/Tokyo';
    var dt = new Date();
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
