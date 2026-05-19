// src/lib/scripts/test-audit.ts
import { routeAndExtract } from '../llm-router';

const MOCK_SARAH_CLEARANCE = `
ARKANSAS DEPARTMENT OF HUMAN SERVICES
DIVISION OF CHILD CARE AND EARLY CHILDHOOD EDUCATION (DCCECE)
CENTRAL REGISTRY BACKGROUND CHECK UNIT

OFFICIAL DETERMINATION REPORT
Date: March 12, 2026
Case ID: CR-2026-88492
Subject Personnel: Sarah Jenkins
DOB: 11/14/1992

Pursuant to the Code of Arkansas Rules (CAR) Title 9, a full multi-state criminal history fingerprint sweep and central registry background check has been completed for the subject individual. 

DETERMINATION: ELIGIBLE
The screening results indicate NO disqualifying criminal offenses or founded histories of maltreatment or neglect as defined under Arkansas state licensing parameters. This individual is officially cleared for unrestricted employment inside an Arkansas licensed childcare environment.

Authorized Signatory:
Director of Licensing Verification, Arkansas DHS
`;

const MOCK_MICHAEL_CPR_EXPIRED = `
AMERICAN RED CROSS - SAFETY CERTIFICATION SERVICE
LIFESAVING TRAINING CREDENTIAL

Course Title: Infant and Child CPR / AED Essential Skills
Participant: Michael Chang
Facility: Little Rock Early Learning Center

Certification Status: Completed Course Evaluation
Instruction Date: May 10, 2023
Expiration Date: May 10, 2025

Notice: This training credential provides evidence that the individual has demonstrated competence in infant airway clearance and cardiac compression rhythms. To maintain operational compliance inside childcare environments, this card must be renewed every two years.
`;

async function executeVerificationLogs() {
  console.log("⚡ Initiating End-to-End AI Brain Validation Test...\n");

  // 1. Test Sarah's Valid Clearance Record
  console.log("--------------------------------------------------");
  console.log("📝 TEST 1: Processing Sarah Jenkins (Valid Background Clearance)...");
  const reportOne = await routeAndExtract({ text: MOCK_SARAH_CLEARANCE });
  console.log("\n📊 AI Compliance Result for Test 1:");
  console.log(JSON.stringify(reportOne, null, 2));

  console.log("\n--------------------------------------------------");

  // 2. Test Michael's Expired CPR Record
  console.log("📝 TEST 2: Processing Michael Chang (Expired CPR Certificate)...");
  const reportTwo = await routeAndExtract({ text: MOCK_MICHAEL_CPR_EXPIRED });
  console.log("\n📊 AI Compliance Result for Test 2:");
  console.log(JSON.stringify(reportTwo, null, 2));
  console.log("--------------------------------------------------");
}

executeVerificationLogs();