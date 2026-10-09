# Digital Twin Challenge Plan

This plan is for the Happiest Health Digital Twin Challenge 2026. The summit is in Bengaluru on 20 November 2026. The contest page is on Unstop: Digital Twin Challenge 2026.

The goal is simple. Build one working prediction for one illness, and show it on a screen a doctor can use. Do not try to build a copy of the whole human body.

## What the contest is asking for

A digital twin, in this contest, means a living copy of one patient on a computer. It is kept up to date with two kinds of information.

The first kind is the old clinic file. This includes who the person is, past illnesses, lab results, and medicines. This is often called an Electronic Health Record, or EHR. It changes slowly.

The second kind is what the body is doing today. This comes from a watch or a small sensor on the skin. Examples are blood sugar through the day, steps, sleep, and heart rate. This changes every few minutes.

The computer looks at both, then tries to warn about a problem before it happens. The team must also show a screen where a doctor can look at this virtual patient.

Teams must pick one long-term or lifestyle illness that is common in India. The contest gives examples: Type 2 diabetes, high blood pressure, or heart risk. A full-body twin is out of scope.

Real named patient records cannot be used. Privacy laws do not allow that. The data must be fake, public, or already anonymized. The contest specifically allows Synthea for fake clinic files, and public research sets for sensor readings.

## What we will build

We will build a doctor’s screen for a virtual patient with Type 2 diabetes. The screen warns, about two hours ahead, that his blood sugar is likely to go too high.

Blood sugar is also called glucose. A spike means it jumps too high, often after a meal, a short night of sleep, or a missed tablet. HbA1c is the lab number that shows average blood sugar over about three months. Under 5.7 percent is typical. A higher number means sugar has been high for a long time.

This choice fits the contest and the work already in this project. The contest itself uses a two-hour glucose warning as its example. Type 2 diabetes is very common in India. And the sample patient already in this repository is a diabetes case.

## What is already in this project

The current app collects clinic papers and turns them into one patient story. A prescription photo, a lab report, spoken notes, and older records can all be stored. A doctor can open a dashboard, check that a paper belongs to the right person, and see a timeline.

The sample patient is Rohan Sharma, age 54. His lab report shows HbA1c at 8.2 percent, which is too high. His kidney check is normal. His cholesterol is a bit high. He is on metformin, a common diabetes tablet, twice a day, and on a cholesterol tablet at night.

That file is the old-clinic-file half of the twin. It is useful, and we should keep it.

What is missing is the other half. There are no readings that change through the day. There is no program that looks ahead. There is no screen that shows a warning. The advice service in the project is only a placeholder.

We should not spend the contest on finishing a full hospital-records system. The judges are scoring a prediction. The identity matching and document reading can stay in the background. We add one new screen on top of the doctor app that already exists.

## How the doctor uses the app

A doctor should be able to do the following without anyone narrating.

The doctor opens the app and sees a short list of virtual patients. Each name has a simple risk label, such as calm, watch, or high.

The doctor opens Rohan Sharma. One side of the screen shows who he is: age, how long he has had diabetes, his last HbA1c, his kidney result, and his medicines.

The other side shows today: a line of his blood sugar, his steps, his sleep, and his heart rate.

At the top, one sentence gives the warning. For example: there is a high chance his sugar goes above 180 in the next two hours.

Under that, the screen says why, in a few plain facts. Each fact has the number it came from. Sugar is already rising after lunch. HbA1c is 8.2 percent. He has only about 1,200 steps. He slept 4.5 hours. His morning tablet is not confirmed.

The doctor can drag a time slider through the day. The warning should appear before the spike, not after it. That slider is the important moment in the demo. It shows the twin is watching, not only displaying yesterday’s lab.

The screen then offers one suggested check, such as a short walk, a note about the meal, or a call to confirm the tablet. The doctor decides. The app does not prescribe.

Two other patients should sit in the list so the demo is not a single fixed slide. One has a stable day. One is an uncertain day, where the app says it is not sure instead of guessing.

## The demo day

Write this day on paper before any model work.

Rohan eats a large lunch. He skips his usual walk. His sugar starts climbing. About two hours before it crosses the high line, the screen changes from calm to a warning and lists the reasons. Later he takes a twenty-minute walk and the warning eases.

Add one detail that feels local, so the story is not a generic overseas app. A late dinner, a festival sweet, or a missed morning metformin tablet is enough.

In the video, say clearly that this day is a demonstration built from public and synthetic data. It is not a real patient’s day.

## What data we need

We need both streams, and we must be able to say where each number came from.

The old clinic file changes slowly. For Rohan, most of it is already in the sample files: age, sex, HbA1c, kidney test, cholesterol, and medicines. We still need a few facts written into the fake file, such as how many years he has had diabetes and whether diabetes runs in the family.

To get more patients, use Synthea. It is a free tool that invents realistic fake clinic records. The contest names it. Use its diabetes module. Label those files as synthetic.

The live signals change all day.

Blood sugar every five minutes is the thing we are predicting. The best public source is the Shanghai Type 2 diabetes glucose set, a research dataset of real sensor traces from people with Type 2 diabetes. The easier backup is the Ohio Type 1 set. It is well known and free to request. It is Type 1 diabetes, so we must say that honestly. We use it to learn the shape of sensor readings, not as proof about Indian Type 2 patients.

Meals matter because food is the usual cause of a rise. The Ohio set includes meal notes. For the demo story, place meals at Indian meal times.

Steps or a walk matter because movement often brings sugar down. The Ohio set has exercise notes. A public watch dataset such as PMData can supply Fitbit-style steps, sleep, and heart rate if we need them.

Sleep matters because a short night makes the next day harder. Use PMData, or a simple made-up night log that is labeled synthetic.

Heart rate shows effort and stress. Use it only if it actually changes the warning. Extra signals that do nothing should stay out of the demo.

MIMIC-IV is a public hospital database the contest allows, but it is intensive-care data, not a person walking around with a watch. We can mention that we considered it. We should not build the model on it.

In the README, label every source in one of three ways: our sample file, Synthea, or the public glucose set. Do not mix them in secret.

## How the twin works

Yes. The illness is Type 2 diabetes. The only question the computer answers is this: in the next two hours, is this person’s blood sugar likely to rise above 180?

180 is a common high line used in home sugar tracking. It is measured in milligrams per decilitre, the unit used on lab reports and home meters in India. We are not trying to diagnose diabetes. We already know the person has it. We are trying to see today’s danger early.

The twin works in three layers.

The first layer is the clinic file. It tells the computer what kind of person this is. Rohan’s HbA1c of 8.2 percent says his sugar runs high in general. Metformin twice a day says he is being treated with tablets, not with insulin injections. A normal kidney result says we are not looking at a kidney crisis. These facts barely change from week to week. They set the background.

The second layer is today. A skin sensor, in the real world, reads sugar about every five minutes. A watch counts steps, sleep, and heart rate. In our prototype we play a recorded day as if those readings were arriving live. The computer keeps only a recent window, mainly the last two to four hours, plus last night’s sleep.

The third layer is the warning. At each moment in the day, the computer looks at the background and the recent window and gives a chance, from low to high, that sugar will cross 180 within two hours. If the chance is high, the screen warns and lists the few facts that pushed it up. If the readings are missing or the chance sits in the middle, the screen says it is not sure.

A time slider lets the doctor move through the day. At 11:00 the warning may be calm. At 12:30, after a large lunch and no walk, it turns on. At 14:30 the recorded sugar actually crosses 180. The point of the demo is that the warning came first.

## The numbers we use

We do not use every number we can find. We use the ones that change the chance of a high sugar reading, and we can explain each one to a doctor.

From the clinic file, the slow numbers are age, sex, body weight, how many years the person has had diabetes, the latest HbA1c, the latest kidney result, cholesterol, and the current medicines, especially whether metformin was prescribed and whether a morning dose is marked as taken. HbA1c matters most among these. A person whose three-month average is already high is more likely to spike than a person whose average is near normal, even on a similar day.

From the day itself, the fast numbers are the sugar readings over the last few hours, whether that line is rising or flat, the time of day, the last meal and how long ago it was, steps or a walk in the last few hours, how long the person slept last night, and heart rate if it adds something the other numbers do not. The recent sugar line matters most. If sugar is already climbing after a meal, a spike is much more likely than if the line is flat.

We also keep a simple log of the morning tablet: taken, missed, or unknown. A missed metformin dose is a reason a doctor understands immediately.

We leave out numbers that do not help this question. A full genetic panel, a long list of unrelated illnesses, and intensive-care hospital charts do not make this warning clearer. Heart rate is included only if, after we test it, the warning gets better with it than without it.

## Can the warning be made from these numbers alone

Yes. The computer never sees the person. It only sees these numbers. That is the whole prediction.

No. These numbers are not the whole of real life. The computer does not know the exact food, a fever starting, a quarrel, a festival sweet that nobody logged, or a tablet swallowed but not recorded. Two people with the same numbers can still have different afternoons.

So the result is a chance, not a promise. We never show “this will happen.” We show “the chance is high” or “the chance is low” or “we cannot tell.” If the sugar readings for the last hour are missing, we do not invent them. We say the twin is not sure, because the most important number is absent.

This is also why the screen lists reasons. A doctor can agree or disagree with the chance by looking at the same numbers.

## How we check that the warning is real

We check the warning on days and people the computer did not learn from. If we test it on the same examples it studied, it can look perfect and still fail on a new person. That mistake is called leakage. We avoid it by keeping some people entirely out of training, then scoring only those people.

A useful check answers two plain questions.

How often did we warn in time? Take the moments when sugar really did cross 180. In how many of those did the screen warn at least two hours earlier, or as early as the data allows? This is the point of the project. A warning that appears after the spike is too late.

How often did we raise a false alarm? Take the moments when sugar stayed in a safe range for the next two hours. In how many of those did we still warn? Too many false alarms teach a doctor to ignore the screen.

We also compare the computer with a simple rule a person could write on paper: if sugar is already rising quickly, warn. If our model cannot beat that rule on the held-out people, the model is not worth showing. Beating a simple rule, by a modest amount, is a stronger result than a large accuracy number with no comparison.

We report the result in sentences, not only in percentages. For example: on people the model had never seen, it warned before most true spikes, and it stayed quiet on most calm afternoons. It missed some spikes that started suddenly after an unlogged meal. It is a proof, not a hospital tool.

The demo day is a separate check. It must be a day we can click through, with the warning appearing before the high reading. We do not pick the one day that flatters us and hide the score on the other people.

## How we build the model

Yes. We need a machine learning model. The contest asks for a working model that reads the clinic file and the day’s readings and predicts a bad event. A screen of charts with no model does not meet that requirement.

Machine learning here means we do not hand-write every rule. We show the computer many past moments, each marked yes or no for “sugar crossed 180 in the next two hours,” and it learns which combinations of numbers tend to come before a yes.

The right model for this project is a boosted tree model, using a free library such as XGBoost or LightGBM. A tree model learns a series of plain questions, such as “is sugar already rising?” and “was there a meal in the last hour?” and “is HbA1c high?” It then adds those answers into a chance. It fits this problem because our data is a table of numbers, the public sets are small, and we must explain the warning. It also trains on a normal laptop.

We do not start with a neural network or a deep learning model. Those need far more patients than a public glucose set contains. On a small set they often memorize the training people and fail on a new person. If the tree model is already beating the paper rule and the screen can explain it, a neural network will not make the entry stronger.

We build it in this order.

First we make the examples, as in the build steps. One row is one moment in a day. The inputs are only numbers known at that moment: HbA1c, medicines, the sugar readings from the last two hours summarized as the latest value, the average, the highest, the lowest, and how fast the line is rising, plus minutes since the last meal, recent steps, last night’s sleep, and the hour of the day. The answer is yes or no for the two hours after that moment. Nothing from the future is allowed in the inputs.

Second we hold out whole people. About one fifth of the people are locked away before any training. They are the final test. Of the remaining people, most are used to learn, and a few are used only to choose settings, such as how sensitive the warning should be. We never tune those settings on the final test people.

Third we train the tree model on the learning people only. We also train a much simpler comparison, logistic regression, which draws one straight relationship between the numbers and the chance. And we score the paper rule: warn if sugar is already rising fast. Three results side by side tell us whether the tree model earned its place.

Fourth we pick the warning line on the tuning people, not on the test people. The model gives a chance, such as 0.72. We must decide what chance counts as a warning. A low line catches more spikes and also cries wolf more often. A high line stays quiet and misses more spikes. We choose the line that warns early often enough without flooding the doctor, then we freeze it. Only then do we score the locked-away people once.

Fifth we read which numbers the model actually used. The library can list them. If HbA1c, the recent rise, and the last meal dominate, the story matches medicine and we can show those reasons on the screen. If a stray number dominates and we cannot explain it, we remove it and train again. Heart rate stays only if the frozen test gets better with it included.

Sixth we save the model as one file the app can load. When the doctor moves the slider, the app builds one row for that moment and asks the saved model for a chance. It does not retrain during the demo.

What we refuse to do: split random rows instead of whole people, put the future sugar value into the inputs, quote accuracy alone, train on Rohan’s demo day and then show that same day as proof, or swap in a deeper model at the end because it sounds more advanced.

## Tracking the person from a distance

We do not build a hardware device.

A medical sensor is a regulated product. Designing one is not required by the contest, and a student prototype must not pretend to be a certified glucose meter or watch. The contest asks for simulated readings or public sensor data. That is the correct path.

In real life, the hardware already exists and stays with the patient. A continuous glucose monitor is a small sensor worn on the arm for about two weeks. Brands such as FreeStyle Libre and Dexcom already send sugar readings to a phone. A normal watch or phone already counts steps, sleep, and heart rate. The phone is the relay. Our app would receive those readings over the internet and update the twin. The doctor sees the twin in the clinic, or on a secure screen, without the patient being in the room. That is the “from a distance” part.

In this prototype we copy that path without the devices. A recorded day is stored as a list of readings with times. The app plays that list forward, one step every few seconds, as if a phone were sending them in. The doctor moves the slider to any moment and sees what the twin knew at that moment, and what it warned. Judges can see the full pipe: clinic file, live-style readings, warning. Nobody has to wear anything.

If we later want a live demo in the room, a phone can send made-up readings on a timer. That is still not a medical device. It only shows that the screen updates when a new number arrives.

## What makes this a strong entry

The judges need to see four things.

The proof works. Two streams go in, and a warning comes out before the bad reading, on a screen a doctor can click through alone.

The reason is plain. The warning names the facts: the last lab, rising sugar, short sleep, few steps. A percentage by itself is not enough.

The use is local. Type 2 diabetes is common in India, and the demo day includes something a doctor here would recognize, such as a late dinner, a festival sweet, or a missed morning tablet.

The limits are honest. The data is public or fake. The model can be wrong. This is a proof, not a hospital product. When the app is unsure, it says so.

## What we have to submit

Phase 1 is a public GitHub repository. The README must include the team names and college or incubator, the project title, the problem in the diabetes story above, the tools and the model in plain language, and an open-source license. MIT is fine.

The repository must also include a video of at least twenty minutes. It can be an unlisted YouTube link or a recorded slide walkthrough of the live app. It must include an architecture drawing as a PDF or slides, showing the clinic file and the live signals going in and the warning coming out. It must include a presentation as a PDF or slides, covering the problem, the method, the result, and what a doctor would do next.

The folder name they asked for is Team Name_College Name. On the submission form, send only the team leader’s name, phone, email, and the public repository link.

After screening, a shortlist presents the working prototype to a jury. The top five present at the summit. Two people from each of those teams travel to Bengaluru, with travel and stay covered. First prize is 1,00,000 rupees, second is 50,000, third is 30,000, and two special awards are 10,000 each. Winning teams also get internship interviews with Happiest Health.

The Unstop page showed about nine days left when it was checked on 8 October 2026. That counter is likely the registration window, not the final code deadline. Confirm both dates on the page and register before it closes.

## The build, step by step

Each step has a finish line. We do not start the next step until that finish line is met. We still keep the build small: one Python service, one new page on the doctor app, and one model file.

Step 1. Freeze the question.

Write down the single question and the high line: will sugar go above 180 in the next two hours? Write Rohan’s demo day in plain sentences, including the lunch, the skipped walk, the warning, and the later walk. Name the three patients: the demo day, a calm day, and an unsure day. Finish line: a one-page story another teammate can read and retell without asking us.

Step 2. Gather the two streams.

Download one public glucose set, preferably the Shanghai Type 2 set, with the Ohio Type 1 set as the backup. For each person in that set, attach a short clinic file: age, HbA1c if we can estimate it from their past sugar or mark it as filled in, medicines, and a note of where every number came from. Keep Rohan’s existing sample as the face of the demo, matched to a recorded day that behaves like his story. Finish line: a folder of patients, each with a clinic file and a timed list of sugar readings, and a short note that says which files are ours, which are Synthea, and which are public.

Step 3. Turn the raw readings into examples.

For many moments in each day, write one row the computer can learn from. The row contains the slow numbers, the recent sugar line, the meal, the steps, the sleep, and the time of day. The answer on that row is simply yes or no: did sugar cross 180 in the following two hours? Drop rows where the future readings are missing, because we cannot know the answer. Finish line: a table of examples, with whole people marked as either “learn from these” or “test on these,” and no person in both groups.

Step 4. Teach a simple warning, then test it.

Train one clear model on the learning people only. Then run it on the test people only. Count warnings that arrived in time, and count false alarms. Compare it with the paper rule “warn if sugar is already rising fast.” Keep heart rate only if the test result improves when it is included. Save the model. Finish line: a short written result with both counts and the comparison, including what the model missed. If it cannot beat the paper rule, we change the numbers we feed it before we build the screen.

Step 5. Make the reasons readable.

The screen must not only show a percentage. For each warning, pick the few facts that moved the chance up: rising sugar, recent meal, short sleep, few steps, high HbA1c, missed tablet. If an important reading is missing, the reason is “not enough data,” and the label is unsure. Finish line: for the demo day, we can point at the moment of the warning and read the reasons out loud without opening the model.

Step 6. Build the doctor page.

Add one page to the existing app. It shows the patient list, Rohan’s clinic file, today’s charts, the warning, the reasons, and the time slider. Playing the slider forward must use only the readings up to that moment. It must not peek at the sugar value two hours later. The later value appears on the chart only after the slider reaches it, so the warning is visibly early. Finish line: a teammate who did not write the model can open the app and walk the demo day alone.

Step 7. Package the proof.

Record the twenty-minute video on that same walkthrough. Draw the path: clinic file and played readings go in, a chance and reasons come out, and no custom device is in the path. Write the README, the license, and the slides with the honest test result. Finish line: a public repository a judge can open and follow without us in the room.
