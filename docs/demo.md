# Client demo: accounts and a 10-minute script

Everything here is synthetic. Start it with `scripts/demo-up.sh` (or `scripts/demo-up.sh reset` for a clean start).
The demo loads a six-lesson A1 course, the A1 checkpoint, 40 sample learners, certificates and announcements.

## Sign-ins

| Where | Who | Sign in |
|---|---|---|
| Admin portal `http://localhost:3001/en/login` | TOMCOM admin `+915599990002` | code `123456`, password from `grep DEV_STAFF_PASSWORD apps/api/.env.local` |
| Admin portal | Trainer: the numbers `+915500000001` to `+915500000004` are the four trainers | same code and password |
| Content studio | Author `+915599990003`, reviewer `+915599990004` | same code and password |
| Phone app | Any new `+9155…` number | code `123456` |

Sample learners you can sign in as on the phone (code `123456`; their progress comes from the server):

| Number | Who | Good for showing |
|---|---|---|
| `+915500000014` | Test-Lakshmi Dummy, plumber, Telugu | Mid-course: 3 of 6 lessons passed, next lesson open |
| `+915500000040` | Test-Indira Sample, electrician, Telugu | All 6 lessons passed: take the A1 checkpoint |
| `+915500000008` | Test-Lakshmi Synthetic, electrician, Telugu | Finished: the certificate in the profile |
| `+915500000006` | Test-Padma Demo, welder, English | The app in English |

## Script

1. **Admin portal, Dashboard.** Numbers for any batch, district, trade or date range. Point at "Stopped here" in the lesson table. Download the Excel.
2. **Batches, Learners.** Trainers see only their own batches. Open one learner.
3. **Phone, sign in as `+915500000014`.** Telugu first. Home shows the continue card, goal and streak. Open lesson 4, play a German phrase, take the quiz.
4. **Phone, Words** (sign in as `+915500000040` for an electrician's words), then the **AI tutor**. Say it is a stand-in until a vendor is chosen.
5. **Admin portal, Mark writing** and **Ready for the exam.** A trainer marks the writing of the learner who finished the checkpoint. Then **Certificates**: open a code to show the public check page.
6. **Admin portal, Announcements.** Post a banner and watch it appear on the phone.

## What to say

- All data and names are synthetic. The Telugu is a sample that still needs the language reviewer.
- German audio is a placeholder tone here; real recordings come from native speakers.
- The tutor is a stand-in, not a real AI, until a vendor is chosen.
- Hosting, real SMS login codes and the store accounts come after the proof of concept.
