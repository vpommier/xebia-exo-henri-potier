const aws = require("aws-sdk")

async function sendToS3(bucketName, event) {
    const params = {
        Bucket: bucketName,
        Key: event.id,
        Body: JSON.stringify(event.detail)
    };
    await new aws.S3({
        apiVersion: '2006-03-01'
    }).upload(params).promise()
}

async function sendToSQS(queueUrl, event) {
    const params = {
        MessageBody: JSON.stringify(event.detail),
        QueueUrl: queueUrl,
        MessageAttributes: {
            'content-type': {
                DataType: 'String',
                StringValue: 'application/json'
            },
            'x-event-type': {
                DataType: 'String',
                StringValue: event['detail-type']
            },
            'x-event-source': {
                DataType: 'String',
                StringValue: event.source
            },
        }
    };
    await new aws.SQS({
        apiVersion: '2012-11-05'
    }).sendMessage(params).promise();
}

exports.lambdaHandler = async (event, context) => {
    try {
        console.log(JSON.stringify(event, null, 2))

        if (event.detail && event.id) {
            const results = await Promise.allSettled([
                sendToS3(process.env.BUCKET_NAME, event),
                sendToSQS(process.env.QUEUE_URL, event)
            ])
            results
                .filter(result => result.status === 'rejected')
                .forEach(result => console.error(result.reason));
        }
    } catch (err) {
        console.error(err);
        return err;
    }
};
