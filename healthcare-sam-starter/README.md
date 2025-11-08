# Health Management Platform (AWS SAM)

This SAM application provisions the serverless backend for the health management experience. It includes Cognito authentication, appointment microservices, and the analytics plumbing described in the architecture brief.

## Prerequisites

- AWS CLI configured with sufficient permissions to create IAM roles, Cognito, DynamoDB, S3, EventBridge, and KMS resources.
- AWS SAM CLI 1.100+.
- Python 3.11 for local packaging.

## Deploy

```bash
sam build
sam deploy --guided
```

Recommended answers during the first deployment:

- **Stack Name**: `health-management-dev`
- **AWS Region**: choose the region that hosts your Cognito users.
- **Parameter EnvironmentName**: `dev` (or another short suffix used in bucket names).
- **Confirm changes before deploy**: `y`
- **Allow SAM CLI IAM role creation**: `y`

SAM outputs the identifiers the frontend needs:

- `ApiBaseUrl`
- `UserPoolId`
- `UserPoolClientId`
- `Region`
- `StaticSiteBucket`
- `DoctorMatchEndpoint` (blank placeholder until a SageMaker endpoint exists)

After deployment upload the built frontend into `StaticSiteBucket` and publish a `config.json` file alongside the HTML that contains:

```json
{
  "apiBaseUrl": "<ApiBaseUrl>",
  "region": "<Region>",
  "userPoolId": "<UserPoolId>",
  "userPoolClientId": "<UserPoolClientId>",
  "doctorMatchEndpoint": ""
}
```

## Local Testing

You can invoke individual functions locally using SAM:

```bash
sam local invoke DoctorsGetFunction --event events/sample-doctors-request.json
```

Provide Cognito-style JWT claims in the `requestContext` when invoking locally.

## Data Lake Buckets

The template creates three encrypted buckets:

- `hm-clinical-raw-<env>-<account>` – receives raw FHIR-like payloads partitioned by patient and date.
- `hm-analytics-curated-<env>-<account>` – receives appointment events written by the EventBridge consumer.
- `hm-feature-store-<env>-<account>` – holds curated features for ML workflows.

Bucket encryption is enforced via a customer-managed KMS key with rotation enabled.

## Seeding Doctors

To pre-populate the Users table with doctor profiles:

```bash
python scripts/seed_doctors.py --table $(aws cloudformation describe-stacks \
  --stack-name health-management-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`UsersTableName`].OutputValue' \
  --output text)
```

or provide a JSON file of doctors using `--input`. Ensure each record contains `userId`, `email`, and optional metadata.

## Updating config.json automatically

After `sam deploy` you can automate config publishing:

```bash
aws s3 cp frontend/config.json s3://$(aws cloudformation describe-stacks \
  --stack-name health-management-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`StaticSiteBucket`].OutputValue' \
  --output text)/config.json
```

where `frontend/config.json` is generated as part of your build pipeline using the stack outputs.

## Cleanup

Remove all resources with:

```bash
sam delete
```

This deletes the CloudFormation stack and associated resources (retained data in S3 buckets must be removed manually if deletion fails).
