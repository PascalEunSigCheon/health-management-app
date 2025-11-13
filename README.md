# Health Management Platform

A modern cloud-based healthcare appointment booking and patient management system. This platform connects patients with doctors through a secure web application, enabling appointment scheduling, vital signs tracking, and health risk assessment.

---

## Overview

The Health Management Platform is a full-stack healthcare application built on AWS serverless architecture. It streamlines the patient-doctor interaction process by providing dedicated portals for both patients and healthcare providers.

**Key capabilities:**
- Patients can search for doctors by specialty and location, book appointments with vital signs submission, track their health metrics, and use an ML-powered diabetes risk assessment tool
- Doctors can review and manage appointment requests, view patient vital signs, and maintain their availability schedules
- Both portals feature secure authentication, real-time updates, and a professional healthcare-inspired interface

---

## What Makes This Different

This is a production-ready demo that showcases modern healthcare software architecture without the complexity of legacy systems. Built entirely on serverless technology, it demonstrates:

- Real-world patient and doctor workflows
- Professional healthcare design principles
- Enterprise security patterns with AWS Cognito
- Cost-effective auto-scaling infrastructure
- Clean, maintainable codebase

The application uses email-based identity management throughout, making it intuitive and debuggable compared to systems that rely solely on UUIDs.

---

## Core Features

### For Patients
- **Smart Doctor Discovery**: Search for healthcare providers by specialty, filter by location, and view availability in real-time
- **Seamless Booking**: Select appointment slots and submit vital signs in one flow
- **Health Tracking**: View your most recently recorded vital signs and health metrics
- **Risk Assessment**: Interactive diabetes risk prediction using machine learning models
- **Modern Interface**: Clean, intuitive design that works beautifully on any device

### For Doctors
- **Request Management**: View all pending appointment requests with complete patient information
- **One-Click Actions**: Quickly confirm or decline appointments
- **Patient Insights**: Access comprehensive vital signs data for each appointment
- **Professional Dashboard**: Healthcare-focused interface with clear information hierarchy

---

## Technical Architecture

### Frontend Stack
The user interface is built with vanilla JavaScript, HTML5, and modern CSS. No frameworks required - just clean, performant web standards. The entire frontend can be served from AWS S3 as a static website or from any web server.

**Technologies:**
- Pure JavaScript (ES6 modules) for client-side logic
- Fetch API for HTTP communication
- AWS Cognito SDK for authentication
- Professional CSS design system inspired by leading healthcare institutions

### Backend Infrastructure
The backend runs entirely on AWS serverless services, meaning zero server management and automatic scaling from zero to thousands of users.

**AWS Services:**
- **Lambda Functions** (Python 3.11): Handle all business logic
- **API Gateway**: RESTful API with JWT authorization
- **DynamoDB**: NoSQL database for users, appointments, and health data
- **Cognito**: User authentication and role-based access control
- **CloudFormation/SAM**: Infrastructure as code for reproducible deployments

**Data Model:**
- Users table stores patient and doctor profiles
- Appointments table with GSI indexes for efficient doctor and patient queries
- PatientHealthIndex table tracks vital signs over time
- All tables use email addresses as primary identifiers for clarity

---

## Prerequisites

To deploy and run this application, you'll need:

**Required:**
- AWS Account (free tier is sufficient for testing)
- AWS SAM CLI installed and configured
- AWS CLI for S3 operations
- Python 3.11 or higher

**Optional:**
- Node.js 18+ (alternative for local development server)

**AWS Permissions:**
You'll need permissions to create and manage: Lambda functions, API Gateway, DynamoDB tables, Cognito User Pools, CloudFormation stacks, S3 buckets, and IAM roles.

---

## Getting Started

### Step 1: Deploy the Backend

Navigate to the backend directory and use SAM to build and deploy:

```bash
cd healthcare-sam-starter
sam build
sam deploy --guided
```

During the guided deployment, you'll be prompted for:
- Stack name (suggestion: `health-management-app`)
- AWS region (any region works, we use `eu-west-3`)
- Confirmation to create IAM roles
- Whether to save arguments for future deployments

After deployment completes, note these CloudFormation outputs:
- **ApiBaseUrl**: Your API Gateway endpoint
- **UserPoolId**: Cognito User Pool identifier
- **UserPoolClientId**: Cognito App Client identifier
- **Region**: Deployment region

### Step 2: Configure the Frontend

Create a `config.json` file in the project root with your deployment details:

```json
{
  "apiBaseUrl": "https://your-api-id.execute-api.your-region.amazonaws.com/v1",
  "region": "your-region",
  "userPoolId": "your-user-pool-id",
  "userPoolClientId": "your-client-id",
  "doctorMatchEndpoint": ""
}
```

### Step 3: Deploy the Frontend

**Option A: AWS S3 Static Website (Recommended)**

Create an S3 bucket and configure it for static website hosting:

```bash
# Create bucket
aws s3 mb s3://your-bucket-name --region your-region

# Configure as website
aws s3 website s3://your-bucket-name --index-document index.html

# Upload files
aws s3 sync . s3://your-bucket-name \
  --exclude ".git/*" \
  --exclude "healthcare-sam-starter/*" \
  --exclude ".venv/*" \
  --region your-region
```

Your site will be available at: `http://your-bucket-name.s3-website.your-region.amazonaws.com`

**Option B: Local Development**

```bash
python -m http.server 3000
# Visit http://localhost:3000
```

### Step 4: Create Users

The application requires users to be in either the PATIENT or DOCTOR Cognito group. You can create users via:

**AWS Console:**
1. Navigate to Cognito in AWS Console
2. Select your User Pool
3. Create user with email and temporary password
4. Add user to PATIENT or DOCTOR group
5. User changes password on first sign-in

**AWS CLI:**
```bash
# Create patient
aws cognito-idp admin-create-user \
  --user-pool-id your-pool-id \
  --username patient@example.com \
  --user-attributes \
    Name=email,Value=patient@example.com \
    Name=given_name,Value=John \
    Name=family_name,Value=Doe \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# Add to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id your-pool-id \
  --username patient@example.com \
  --group-name PATIENT

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id your-pool-id \
  --username patient@example.com \
  --password YourPassword123! \
  --permanent
```

### Step 5: Seed Doctor Data

Use the provided script to populate the database with doctor profiles:

```bash
cd healthcare-sam-starter/scripts
python seed_doctors.py
```

Make sure to update the script with your API base URL first.

---

## Project Structure

```
health-management-app/
├── index.html                  # Landing page
├── signin.html                 # Authentication page
├── signup.html                 # Registration page
├── patient.html                # Patient portal
├── doctor.html                 # Doctor portal
├── forgot-password.html        # Password recovery
├── config.json                 # Frontend configuration
├── README.md                   # This file
│
├── assets/                     # Frontend resources
│   ├── app.js                  # Core utilities and API client
│   ├── patient.js              # Patient portal functionality
│   ├── doctor.js               # Doctor portal functionality
│   ├── signin.js               # Authentication logic
│   ├── signup.js               # Registration logic
│   ├── forgot-password.js      # Password recovery logic
│   ├── constants.js            # Application constants
│   ├── styles.css              # Design system (1200+ lines)
│   └── demo-data/
│       ├── doctors.json        # Sample doctor profiles
│       └── patients.json       # Sample patient data
│
└── healthcare-sam-starter/     # Backend infrastructure
    ├── template.yaml           # CloudFormation template
    ├── samconfig.toml          # SAM configuration
    │
    ├── functions/              # Lambda function code
    │   ├── common.py           # Shared utilities
    │   ├── appointments_create/
    │   ├── appointments_get_patient/
    │   ├── appointments_get_doctor/
    │   ├── appointments_confirm/
    │   ├── appointments_decline/
    │   ├── appointments_cancel/
    │   ├── doctors_get/
    │   ├── patient_health_index_get/
    │   ├── patient_health_summary_get/
    │   ├── auth_post_confirm/
    │   ├── events_to_s3_writer/
    │   └── predict_proxy/
    │
    └── scripts/                # Deployment utilities
        ├── seed_doctors.py
        ├── seed_patients.py
        └── create-cognito-doctors.ps1
```

---

## API Reference

The backend exposes a RESTful API through API Gateway. All endpoints require JWT authentication via the Authorization header.

**Base URL:** `https://{api-id}.execute-api.{region}.amazonaws.com/v1`

### Appointments

**Get Patient Appointments**
```
GET /appointments/patient
Returns: { items: [appointment objects] }
```

**Get Doctor Appointments**
```
GET /appointments/doctor?status=PENDING
Query params: status (PENDING, CONFIRMED, DECLINED, CANCELLED)
Returns: { items: [appointment objects] }
```

**Create Appointment**
```
POST /appointments
Body: {
  doctorId: "doctor@example.com",
  slotISO: "2025-11-15T14:00:00Z",
  vitals: { bloodPressureSystolic: 120, ... },
  reasonCode: "GENERAL"
}
Returns: { appointmentId: "...", status: "PENDING" }
```

**Confirm/Decline/Cancel Appointment**
```
POST /appointments/{appointmentId}/confirm
POST /appointments/{appointmentId}/decline
POST /appointments/{appointmentId}/cancel
Returns: { message: "Success" }
```

### Doctors

**List Doctors**
```
GET /doctors
Returns: { items: [doctor objects] }
```

### Health Data

**Get Latest Vitals**
```
GET /patient-health/{email}/latest
Returns: { item: { metrics: {...} } }
```

**Get Health Summary**
```
GET /patient-health-summary/{email}
Returns: Health summary data
```

### Machine Learning

**Predict Diabetes Risk**
```
POST /predict
Body: { features: { BMI: 25, HighBP: 0, ... } }
Returns: { probability: 0.15 }
```

---

## Configuration Options

### Backend Settings

Edit `healthcare-sam-starter/template.yaml` to adjust:

- **DEMO_MODE**: Set to "true" to enable demo fallback behavior
- **Lambda Memory**: Default 512MB per function
- **DynamoDB Billing**: PAY_PER_REQUEST (on-demand) or PROVISIONED
- **API Throttling**: Default 1000 requests/second

### Frontend Settings

The `config.json` file controls:

- **apiBaseUrl**: Backend API endpoint
- **region**: AWS region for Cognito
- **userPoolId**: Cognito User Pool ID
- **userPoolClientId**: Cognito App Client ID
- **doctorMatchEndpoint**: Optional AI matching endpoint (leave empty)

---

## Testing the Application

### Patient Workflow Test

1. Sign in as a patient
2. Navigate to "Book an Appointment"
3. Select a specialty (e.g., Cardiology)
4. Enter vital signs (Blood Pressure: 120/80, BMI: 25, etc.)
5. Click "Find Available Doctors"
6. Select a time slot from an available doctor
7. Click "Book appointment"
8. Verify the appointment appears in "My Appointments"
9. Check that vitals appear in "Latest Submitted Vitals"

### Doctor Workflow Test

1. Sign in as a doctor
2. View pending appointment requests
3. Click on a request to see patient vitals
4. Confirm or decline the appointment
5. Verify the appointment status updates

### Debug Tools

The application includes browser console debugging tools:

```javascript
// Check current state
window.debugApp.getState()

// View appointments
window.debugApp.getAppointments()

// View vitals
window.debugApp.getLatestMetrics()

// Reload data
await window.debugApp.reloadData()

// Check authentication
window.debugApp.checkAuth()
```

---

## Troubleshooting

### Common Issues

**"Unable to find doctors"**
- Run the seed_doctors.py script to populate the database
- Check that doctors have the correct specialty field
- Verify specialty names match exactly (case-sensitive)

**"Appointments not showing"**
- Check browser console for errors
- Verify user is in correct Cognito group (PATIENT or DOCTOR)
- Use debug tools: `window.debugApp.getAppointments()`
- Check that appointments were created successfully

**"Vitals not displaying"**
- Vitals are only stored when booking an appointment
- Check PatientHealthIndex table in DynamoDB
- Verify the appointment was confirmed by a doctor
- Use debug tools: `window.debugApp.getLatestMetrics()`

**"Authentication errors"**
- Clear browser cache and cookies
- Sign out and sign in again
- Verify config.json has correct Cognito settings
- Check that user exists in Cognito User Pool

**"Auto-scroll not working"**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Check for JavaScript errors in console
- Verify patient.js is loading correctly

### Checking Logs

**Lambda Logs:**
```bash
sam logs -n AppointmentsCreateFunction --tail
```

**API Gateway Logs:**
Enable CloudWatch logging in API Gateway console

**Browser Console:**
Open Developer Tools (F12) and check Console tab for errors

---

## Security Considerations

This is a demonstration application. For production healthcare applications, additional security measures are required:

**Current Security:**
- JWT-based authentication with 1-hour token expiration
- Role-based access control (PATIENT and DOCTOR groups)
- HTTPS/TLS encryption for all API calls
- DynamoDB encryption at rest
- Input validation on all forms
- CORS properly configured

**For Production:**
- HIPAA compliance requires a Business Associate Agreement with AWS
- Implement comprehensive audit logging (CloudTrail)
- Add data retention and deletion policies
- Enable AWS CloudWatch monitoring and alerting
- Implement rate limiting and DDoS protection
- Add multi-factor authentication (MFA)
- Regular security audits and penetration testing
- PHI encryption with customer-managed keys
- Implement data residency controls

**Important:** This application is for educational and demonstration purposes. Do not use it to store real protected health information (PHI) without implementing proper HIPAA compliance measures.

---

## Technology Stack

**Frontend:**
- HTML5 for semantic structure
- CSS3 with custom design system
- Vanilla JavaScript (ES6 modules)
- AWS Cognito SDK for authentication

**Backend:**
- AWS Lambda (Python 3.11)
- API Gateway (REST API)
- DynamoDB (NoSQL database)
- Cognito (User management)
- CloudFormation/SAM (Infrastructure as Code)

**Development:**
- Git for version control
- AWS CLI for deployments
- SAM CLI for local testing

---

## Updating the Application

### Backend Changes

After modifying Lambda function code:

```bash
cd healthcare-sam-starter
sam build
sam deploy
```

### Frontend Changes

After modifying HTML, CSS, or JavaScript:

```bash
# Upload to S3
aws s3 sync . s3://your-bucket-name \
  --exclude ".git/*" \
  --exclude "healthcare-sam-starter/*" \
  --region your-region

# Or for single file
aws s3 cp patient.html s3://your-bucket-name/patient.html
```

For local development, just refresh the browser.

---

## Contributing

Contributions are welcome. When submitting changes:

1. Fork the repository
2. Create a feature branch
3. Make your changes with clear commit messages
4. Test thoroughly (both patient and doctor workflows)
5. Submit a pull request with a description of changes

Please maintain the existing code style and add comments for complex logic.

---

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute this software for any purpose, including commercial applications, provided you include the original copyright notice.

---

## Acknowledgments

This application demonstrates modern serverless architecture patterns for healthcare applications. The design is inspired by leading healthcare platforms while maintaining simplicity and clarity.

Built with a focus on developer experience, clean code, and production-ready patterns.

---

## Support

For issues or questions:
- Check the Troubleshooting section above
- Review browser console for error messages
- Use the debug tools: `window.debugApp`
- Check AWS CloudWatch logs for backend issues

When reporting issues, please include:
- Browser and version
- Error messages from console
- Steps to reproduce the issue
- Current configuration (redact sensitive info)

---

**Happy coding and building better healthcare experiences!**

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Guide](#deployment-guide)
- [User Management](#user-management)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Security](#security)

---

## 🎯 Overview

The Health Management Platform is a full-stack healthcare application that streamlines patient-doctor interactions. Built with modern web technologies and AWS serverless architecture, it provides:

- **Patient Portal**: Search for doctors by specialty, book appointments, track vitals, and assess health risks
- **Doctor Portal**: Manage appointment requests, view patient vitals, and maintain availability schedules
- **Secure Authentication**: AWS Cognito-based user authentication with role-based access control
- **Real-time Updates**: Dynamic appointment status tracking and instant notifications
- **Health Analytics**: Machine learning-powered diabetes risk assessment tool

---

## Key features

### For Patients
- **Smart doctor search**: Find doctors by specialty, location, and availability
- **Appointment booking**: Select time slots and book appointments with vital signs submission
- **Vitals tracking**: Record and monitor blood pressure, BMI, glucose levels, and more
- **Health risk assessment**: ML-powered diabetes risk prediction tool
- **Responsive design**: Professional healthcare-inspired UI optimized for all devices

### For Doctors
- **Request management**: View, confirm, or decline patient appointment requests
- **Patient vitals dashboard**: Access comprehensive patient health metrics
- **Schedule management**: Maintain availability and manage appointment slots
- **Professional interface**: Clinical blue design inspired by leading healthcare institutions

### Technical Highlights
- ⚡ **Serverless Architecture**: Cost-effective, auto-scaling AWS Lambda functions
- 🔐 **Enterprise Security**: JWT-based authentication with encrypted data storage
- 📡 **RESTful API**: Clean, documented API Gateway endpoints
- 🎨 **Modern UI/UX**: Professional healthcare design system with smooth animations
- 🔄 **Auto-scroll Navigation**: Enhanced user flow with intelligent page navigation

---

## 🏗️ Architecture

### Frontend
```
Static Website (S3 / Local)
├── HTML5 Pages (Patient, Doctor, Auth)
├── Vanilla JavaScript (ES6 Modules)
└── Modern CSS (Healthcare Design System)
```

### Backend (AWS Serverless)
```
API Gateway (RESTful)
├── Lambda Functions (Python 3.11)
│   ├── Authentication & Authorization
│   ├── Appointments CRUD Operations
│   ├── Doctor Search & Filtering
│   ├── Patient Health Index Management
│   └── ML Prediction Proxy
├── DynamoDB Tables
│   ├── Users (Patients & Doctors)
│   ├── Appointments (with GSI indexes)
│   └── PatientHealthIndex
└── Cognito User Pool
    ├── Patient Group
    └── Doctor Group
```

---

## 📦 Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| **AWS Account** | - | Deployment target |
| **AWS SAM CLI** | ≥1.80 | Backend deployment |
| **AWS CLI** | ≥2.0 | S3 operations |
| **Python** | ≥3.11 | Lambda runtime & local scripts |
| **Node.js** | ≥18 (optional) | Alternative local server |

### AWS Permissions Required
- CloudFormation (create/update stacks)
- Lambda (create/update functions)
- API Gateway (create/update APIs)
- DynamoDB (create/update tables)
- Cognito (create/update user pools)
- IAM (create roles and policies)
- S3 (bucket operations)

---

## 🚀 Quick Start

### 1. Clone & Configure
```bash
git clone <repository-url>
cd health-management-app
```

### 2. Deploy Backend
```bash
cd healthcare-sam-starter
sam build
sam deploy --guided
```

**Note the CloudFormation outputs:**
- `ApiBaseUrl`
- `UserPoolId`
- `UserPoolClientId`
- `Region`

### 3. Configure Frontend
Create `config.json` in the project root:
```json
{
  "apiBaseUrl": "https://<api-id>.execute-api.<region>.amazonaws.com/v1",
  "region": "<region>",
  "userPoolId": "<user-pool-id>",
  "userPoolClientId": "<client-id>",
  "doctorMatchEndpoint": ""
}
```

### 4. Deploy Frontend to S3 (Production)
```bash
# Create S3 bucket
aws s3 mb s3://health-management-app --region <region>

# Configure as static website
aws s3 website s3://health-management-app --index-document index.html

# Upload files
aws s3 sync . s3://health-management-app --exclude ".git/*" --exclude "healthcare-sam-starter/*" --exclude ".venv/*" --region <region>

# Make public (optional, for demo)
aws s3api put-bucket-policy --bucket health-management-app --policy file://bucket-policy.json
```

**bucket-policy.json:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::health-management-app/*"
  }]
}
```

### 5. Run Locally (Development)
```bash
# Using Python
python -m http.server 3000

# Using Node.js (if installed)
npx http-server -p 3000
```

Access at: `http://localhost:3000`

---

## 📖 Deployment Guide

### Backend Deployment (SAM)

#### Step 1: Build
```bash
cd healthcare-sam-starter
sam build
```

#### Step 2: Deploy
```bash
sam deploy --guided
```

**Configuration prompts:**
- Stack Name: `health-management-app`
- AWS Region: `eu-west-3` (or your preferred region)
- Confirm changes: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to config: `Y`

#### Step 3: Update After Code Changes
```bash
sam build && sam deploy
```

### Frontend Deployment

#### Option A: AWS S3 Static Website (Recommended)
```bash
# Sync all frontend files
aws s3 sync . s3://health-management-app \
  --exclude ".git/*" \
  --exclude "healthcare-sam-starter/*" \
  --exclude ".venv/*" \
  --exclude "__pycache__/*" \
  --region <region>
```

**Website URL format:**
```
http://health-management-app.s3-website.<region>.amazonaws.com
```

#### Option B: CloudFront + S3 (Production)
For HTTPS and better performance, add CloudFront distribution in front of S3.

#### Option C: Local Development
```bash
python -m http.server 3000
```

---

## 👥 User Management

### Creating Test Users

#### Demo Mode (Automatic)
The app includes DEMO_MODE support with predefined users:
- **Patient**: `patient.demo@example.com` / `HealthPass!1`
- **Doctor**: `cardio.demo1@example.com` / `HealthPass!1`

#### Manual User Creation (AWS Console)
1. Go to AWS Cognito → User Pools → `<YourPoolId>`
2. Create user with email and temporary password
3. Add user to group: `PATIENT` or `DOCTOR`
4. User must change password on first sign-in

#### CLI User Creation (Automated)
```bash
# Create patient
aws cognito-idp admin-create-user \
  --user-pool-id <pool-id> \
  --username patient@example.com \
  --user-attributes Name=email,Value=patient@example.com Name=given_name,Value=John Name=family_name,Value=Doe \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# Add to PATIENT group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <pool-id> \
  --username patient@example.com \
  --group-name PATIENT

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id <pool-id> \
  --username patient@example.com \
  --password HealthPass!1 \
  --permanent
```

### Seeding Doctors
```bash
cd healthcare-sam-starter/scripts
python seed_doctors.py
```

**Note**: Update `seed_doctors.py` with your API Base URL and credentials.

---

## ⚙️ Configuration

### Frontend Configuration (`config.json`)
```json
{
  "apiBaseUrl": "https://z2g4cgeey8.execute-api.eu-west-3.amazonaws.com/v1",
  "region": "eu-west-3",
  "userPoolId": "eu-west-3_eBWHgEcTr",
  "userPoolClientId": "4k8r7q6p5m3n2l1k0j9i8h7g",
  "doctorMatchEndpoint": ""
}
```

### Backend Configuration (`template.yaml`)
Key parameters in SAM template:
- `DEMO_MODE`: Enable/disable demo fallbacks (`"true"` or `"false"`)
- Lambda memory: 512MB (adjustable per function)
- DynamoDB billing: PAY_PER_REQUEST (serverless)
- API Gateway throttling: 1000 requests/sec

### Environment Variables (Lambda)
Set via `template.yaml`:
```yaml
Environment:
  Variables:
    USERS_TABLE: !Ref UsersTable
    APPOINTMENTS_TABLE: !Ref AppointmentsTable
    PATIENT_HEALTH_INDEX_TABLE: !Ref PatientHealthIndexTable
    DEMO_MODE: "true"
```

---

## 🧪 Testing

### Manual Testing

#### Patient Flow
1. Sign up → `signup.html`
2. Confirm email (check Cognito)
3. Sign in → `signin.html`
4. Book appointment → `patient.html`
   - Select specialty (e.g., Cardiology)
   - Enter vitals (BP, BMI, etc.)
   - Find doctors
   - Select slot and book

#### Doctor Flow
1. Sign in as doctor → `signin.html`
2. View requests → `doctor.html`
3. Confirm/decline appointments
4. View patient vitals

### API Testing (Postman/curl)
```bash
# Get doctors
curl -X GET https://<api-url>/v1/doctors \
  -H "Authorization: Bearer <jwt-token>"

# Get patient appointments
curl -X GET https://<api-url>/v1/appointments/patient \
  -H "Authorization: Bearer <jwt-token>"
```

---

## Troubleshooting

### Issue: "Uncaught ReferenceError: gatherVitals is not defined"
**Solution**: Fixed in latest version. Ensure `patient.js` uses `collectVitals()`.

### Issue: "Appointments not showing"
**Causes:**
1. User not in correct Cognito group
2. No appointments created yet
3. JWT token expired

**Solution:**
- Check browser console for errors
- Verify user is in `PATIENT` group
- Sign out and sign in again

### Issue: "Doctors not found in search"
**Causes:**
1. No doctors seeded in database
2. Specialty filter mismatch
3. No available slots

**Solution:**
- Run `seed_doctors.py` script
- Check DynamoDB Users table for doctor entries
- Verify doctor profiles have `specialty` field

### Issue: "CORS errors"
**Solution:**
- Ensure API Gateway has CORS enabled
- Check `AllowOrigin` header in Lambda responses
- For S3, configure CORS in bucket policy

### Issue: "Vitals not displaying"
**Solution:**
- Fixed in latest version (uses email instead of UUID)
- Ensure appointments were booked with vitals
- Check PatientHealthIndex DynamoDB table

### Debug Mode
Open browser console and use:
```javascript
// Check app state
window.debugApp.getLastDoctors()
window.debugApp.getConfig()
window.debugApp.getSession()
window.debugApp.checkSlots()
```

---

## 📁 Project Structure

```
health-management-app/
├── 📄 index.html                    # Landing page
├── 📄 signin.html                   # Sign in page
├── 📄 signup.html                   # Sign up page
├── 📄 forgot-password.html          # Password recovery
├── 📄 patient.html                  # Patient portal
├── 📄 doctor.html                   # Doctor portal
├── 📄 config.json                   # Frontend configuration
├── 📄 README.md                     # This file
│
├── 📁 assets/                       # Frontend assets
│   ├── app.js                       # Core utilities (auth, API client)
│   ├── patient.js                   # Patient portal logic
│   ├── doctor.js                    # Doctor portal logic
│   ├── signin.js                    # Sign in logic
│   ├── signup.js                    # Sign up logic
│   ├── forgot-password.js           # Password reset logic
│   ├── constants.js                 # App constants (specialties, vitals)
│   ├── styles.css                   # Global styles (healthcare design system)
│   └── demo-data/
│       ├── doctors.json             # Sample doctor data
│       └── patients.json            # Sample patient data
│
└── 📁 healthcare-sam-starter/       # Backend (AWS SAM)
    ├── template.yaml                # CloudFormation template
    ├── samconfig.toml               # SAM CLI configuration
    ├── doctors.json                 # Doctor seed data
    │
    ├── 📁 functions/                # Lambda functions
    │   ├── common.py                # Shared utilities
    │   ├── appointments_create/     # POST /appointments
    │   ├── appointments_get_patient/ # GET /appointments/patient
    │   ├── appointments_get_doctor/ # GET /appointments/doctor
    │   ├── appointments_confirm/    # POST /appointments/{id}/confirm
    │   ├── appointments_decline/    # POST /appointments/{id}/decline
    │   ├── appointments_cancel/     # POST /appointments/{id}/cancel
    │   ├── doctors_get/             # GET /doctors
    │   ├── patient_health_index_get/ # GET /patient-health/{id}/latest
    │   ├── patient_health_summary_get/ # GET /patient-health-summary/{id}
    │   ├── auth_post_confirm/       # Cognito post-confirmation trigger
    │   ├── events_to_s3_writer/     # Event logging (optional)
    │   └── predict_proxy/           # POST /predict (diabetes risk)
    │
    └── 📁 scripts/                  # Utility scripts
        ├── seed_doctors.py          # Seed doctor data
        ├── seed_patients.py         # Seed patient data
        └── create-cognito-doctors.ps1 # Create doctor users in Cognito
```

---

## 🛠️ Technology Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **HTML5** | Semantic structure |
| **CSS3** | Modern healthcare design system |
| **JavaScript (ES6+)** | Client-side logic |
| **Fetch API** | HTTP requests |
| **AWS Cognito SDK** | Authentication |

### Backend
| Technology | Purpose |
|-----------|---------|
| **AWS Lambda** | Serverless compute |
| **Python 3.11** | Lambda runtime |
| **API Gateway** | RESTful API |
| **DynamoDB** | NoSQL database |
| **Cognito** | User authentication |
| **CloudFormation** | Infrastructure as Code |
| **AWS SAM** | Deployment framework |

### DevOps
| Tool | Purpose |
|------|---------|
| **SAM CLI** | Build & deploy backend |
| **AWS CLI** | Resource management |
| **Git** | Version control |

---

## 🔐 Security

### Authentication
- **JWT Tokens**: Cognito-issued tokens with 1-hour expiration
- **Role-Based Access**: Separate `PATIENT` and `DOCTOR` groups
- **Email Verification**: Required for sign-up

### Data Protection
- **Encryption at Rest**: DynamoDB encryption enabled
- **Encryption in Transit**: HTTPS/TLS 1.2+
- **API Authorization**: Lambda authorizers validate JWT tokens

### Best Practices
- ✅ Passwords hashed by Cognito (bcrypt)
- ✅ No sensitive data in frontend code
- ✅ CORS properly configured
- ✅ Rate limiting on API Gateway
- ✅ Input validation on all forms

### HIPAA Compliance Note
⚠️ This is a **demo application** and is not HIPAA-compliant. For production healthcare applications, additional security measures are required:
- BAA (Business Associate Agreement) with AWS
- Audit logging (CloudTrail, CloudWatch)
- Data residency controls
- PHI encryption standards
- Access controls and monitoring

---

## 📊 API Reference

### Base URL
```
https://<api-id>.execute-api.<region>.amazonaws.com/v1
```

### Endpoints

#### Appointments
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/appointments/patient` | Get patient's appointments | Patient |
| GET | `/appointments/doctor?status=PENDING` | Get doctor's appointments | Doctor |
| POST | `/appointments` | Create appointment | Patient |
| POST | `/appointments/{id}/confirm` | Confirm appointment | Doctor |
| POST | `/appointments/{id}/decline` | Decline appointment | Doctor |
| POST | `/appointments/{id}/cancel` | Cancel appointment | Patient |

#### Doctors
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/doctors` | List all doctors | Any |

#### Health Data
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/patient-health/{email}/latest` | Get latest vitals | Patient |
| GET | `/patient-health-summary/{email}` | Get health summary | Patient/Doctor |

#### ML Prediction
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/predict` | Diabetes risk assessment | Any |

---

## 🤝 Contributing

Contributions welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 📧 Support

For issues, questions, or contributions:
- **GitHub Issues**: Create an issue in the repository
- **Documentation**: Refer to this README and AWS documentation

---

**Built for modern healthcare**
