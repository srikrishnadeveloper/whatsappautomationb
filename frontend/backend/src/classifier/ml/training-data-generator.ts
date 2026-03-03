/**
 * =====================================================================
 * AUTOMATIC TRAINING DATA GENERATOR
 * Generates labeled WhatsApp-style messages for ML model training
 * No manual data collection needed - fully synthetic
 * =====================================================================
 */

interface TrainingExample {
  text: string;
  category: 'work' | 'study' | 'personal' | 'ignore';
  priority: 'urgent' | 'high' | 'medium' | 'low';
}

// ============================================
// MESSAGE TEMPLATES — realistic WhatsApp style
// ============================================

const WORK_TEMPLATES = [
  // Meeting related
  'Team meeting at {time} today, please join',
  'Can everyone attend the standup at {time}?',
  'Sprint planning meeting rescheduled to {day}',
  'Join the sync call at {time}, link: meet.google.com/xyz',
  'Client demo is tomorrow at {time}',
  'Reminder: Project review meeting {day} at {time}',
  'Please prepare your updates for the standup',
  'All-hands meeting this {day} at {time}',
  'Can you attend the retrospective at {time}?',
  '1:1 with manager rescheduled to {day}',
  'Daily scrum meeting at {time} sharp',
  'Townhall presentation next {day}',
  'Workshop on agile methodology this {day}',

  // Task/Deadline
  'Please submit the quarterly report by {day}',
  'The deployment deadline is {day}, make sure code is ready',
  'Can you review the PR before end of day?',
  'Client presentation needs to be ready by {day}',
  '{name}, please update the jira tickets',
  'Need the budget forecast by {day} eod',
  'Finish the API documentation before {day}',
  'Please send the project status update to stakeholders',
  'Complete the code review for the payment module',
  'Update the confluence page with new architecture',
  'Push the hotfix to production by tonight',
  'We need to close these JIRA tickets this sprint',
  'The release is blocked, need your approval',
  'Deploy staging build and run QA tests',
  'Prepare the SOW for the new client project',
  'Send the invoice to the finance team',
  'Update the roadmap with Q3 milestones',
  'Fix the blocker bug before release',
  'Need sign-off on the design mockups',
  'Set up the CI/CD pipeline for the new service',

  // Urgent work
  'URGENT: Production server is down, need immediate fix',
  'Client escalation - respond ASAP',
  'Critical bug in payment flow, fix immediately',
  'SEV1 incident - all hands on deck',
  'Drop everything, we need this deployed now',
  'Emergency meeting in 10 minutes',
  'The database is down, need DBA support asap',
  'Priority: Customer data issue needs immediate attention',

  // General work communication
  'Please share the API credentials for the staging environment',
  'Can you check why the build is failing?',
  'The new feature needs to go through QA first',
  'HR wants everyone to fill out the feedback form by {day}',
  'Your leave request has been approved',
  'Please submit your timesheet before {day}',
  'Training session on cloud computing this {day}',
  'Team outing planned for next {day}',
  'Performance review scheduled for {day}',
  'Salary slip for this month is available',
  'Need to discuss the architecture with the team',
  'Can you mentor the new intern on the project?',
  'Share the test results with the QA team',
  'Let\'s set up a call with the vendor tomorrow',
  'Please coordinate with the DevOps team for the deployment',
  'The client wants a demo of the new features',
  'Submit the weekly progress report',
  'Need to finalize the SLA with the vendor',
  'Board presentation deck needs review',
  'Compliance audit documents needed by {day}',
];

const STUDY_TEMPLATES = [
  // Assignments
  'Assignment for data structures is due {day}',
  'Submit the lab report by {day}',
  'Group project presentation on {day}',
  'Need to complete the homework for chapter 5',
  'The thesis draft needs to be submitted by {day}',
  'Professor wants the research paper by next {day}',
  'Can anyone share notes for today\'s lecture?',
  'Study group meeting at library at {time}',
  'Revision for midterm exam starts {day}',
  'Upload the assignment on the course portal before midnight',
  'The professor extended the deadline to {day}',
  'Need help with the database assignment',
  'Lab practical exam is on {day}',
  'Submit the dissertation abstract this week',
  'Project submission portal closes on {day}',

  // Exams
  'Final exam schedule is out, check the website',
  'Midterm exam for operating systems on {day}',
  'Practice mock test available on {day}',
  'Who has the past year question papers for physics?',
  'Viva is scheduled for {day} at {time}',
  'GPA calculations are up on student portal',
  'Results will be declared on {day}',
  'Quiz on chapter 7 tomorrow',
  'Internal assessment marks have been uploaded',
  'Supplementary exam registration deadline is {day}',

  // Course/Academic
  'Lecture cancelled for tomorrow',
  'Extra class on {day} at {time}',
  'New course material uploaded on Moodle',
  'Library books need to be returned by {day}',
  'Seminar on machine learning this {day}',
  'Attend the guest lecture on AI at {time}',
  'Course registration for next semester starts {day}',
  'Campus placement drive starting next week',
  'Internship application deadline is {day}',
  'Scholarship form needs to be submitted by {day}',
  'College fest volunteering signup by {day}',
  'Tutorial session for calculus at {time}',
  'Department meeting for all students on {day}',
  'Workshop on research methodology this {day}',
  'Conference paper submission deadline is {day}',

  // Study groups
  'Let\'s study for the algorithms exam together',
  'Can we meet at the hostel to discuss the project?',
  'Share your notes for the chemistry lecture',
  'Who is going to the coding workshop?',
  'Study material for semester exams uploaded in drive',
  'Group discussion for economics at {time}',
  'Anyone taking the elective course on NLP?',
  'Teaching assistant office hours are {day} {time}',
];

const PERSONAL_TEMPLATES = [
  // Errands and chores
  'Buy groceries on the way home',
  'Pick up the dry cleaning before {time}',
  'Doctor appointment at {time} on {day}',
  'Need to pay the electricity bill by {day}',
  'Recharge the DTH before it expires',
  'Reminder: Car service appointment on {day}',
  'Book dentist appointment for this week',
  'Pick up kids from school at {time}',
  'Order medicines from pharmacy',
  'Get the laptop repaired this weekend',
  'Plumber is coming on {day} morning',
  'Call the electrician for AC repair',
  'Renew gym membership before {day}',
  'Submit passport renewal documents',
  'Pay credit card bill before due date',

  // Travel and bookings
  'Book flight tickets for the trip to {city}',
  'Hotel reservation needed for {day}',
  'Train ticket booked for {day} at {time}',
  'Visa documents need to be submitted by {day}',
  'Airport cab booked for {time}',
  'Pack bags for the trip tomorrow',
  'Confirm hotel booking before {day}',
  'Rent a car for the weekend trip',

  // Family and events
  'Mom\'s birthday is on {day}, order cake',
  'Anniversary dinner reservation at {time}',
  'RSVP to the wedding invitation by {day}',
  'Buy a gift for {name}\'s birthday',
  'Plan surprise party for {day}',
  'Family dinner at {time} on {day}',
  'Send birthday wishes to {name}',
  'Pick up the anniversary gift',

  // Health and fitness
  'Yoga class at {time} tomorrow',
  'Blood test report collection on {day}',
  'Schedule vaccination appointment',
  'Start the new diet plan from {day}',
  'Workout session with trainer at {time}',
  'Medical checkup at {time} on {day}',

  // Finance
  'EMI payment due on {day} for home loan',
  'Insurance premium due next {day}',
  'Transfer rent to landlord before {day}',
  'File tax returns before the deadline',
  'Review investment portfolio this week',
  'SIP amount debited, check balance',

  // Random tasks
  'Remind me to call {name} at {time}',
  'Need to get the car washed this weekend',
  'Buy milk and bread on the way back',
  'Take the dog to the vet on {day}',
  'Water the plants every morning',
  'Organize the closet this weekend',
  'Return the library book by {day}',
  'Fix the leaking tap this weekend',
  'Clean the garage on {day}',
  'Sort out the old clothes for donation',
];

const IGNORE_TEMPLATES = [
  // Greetings  
  'Good morning everyone!',
  'Hey, how are you?',
  'Hi there!',
  'Hello 👋',
  'Yo whats up',
  'Hey bro',
  'Namaste',
  'Good night everyone',
  'Good evening guys',

  // Reactions/responses
  'Ok',
  'Okay 👍',
  'Sure',
  'Thanks!',
  'Thank you so much',
  'Alright',
  'Got it',
  'Noted',
  'Cool',
  'Nice one',
  'Great',
  'Awesome',
  'Perfect',
  'Amazing',
  'Wow',
  'Haha',
  'Lol',
  '😂😂😂',
  '👍',
  '❤️',
  '🙏',
  'Hmm',
  'Ya',
  'Yep',
  'Nope',
  'Nah',
  'K',
  'Kk',
  'Done ✅',
  'Seen',
  'Roger that',

  // Casual chat
  'Did you watch the match yesterday?',
  'What are you having for lunch?',
  'The weather is so nice today',
  'Anyone up for coffee?',
  'Just had the best pizza ever',
  'Check out this meme 😂',
  'lmao this is hilarious',
  'Bro did you see what happened',
  'That movie was amazing',
  'Who\'s coming to the party tonight?',
  'I\'m so tired today',
  'Can\'t believe it\'s already {day}',
  'Weekend plans anyone?',
  'Traffic is terrible today',
  'This song is stuck in my head',
  'Netflix recommendations?',
  'What a beautiful sunset 🌅',
  'Just woke up, feeling lazy',
  'Missing the old times',
  'Happy Birthday! 🎉🎂',
  'Congratulations!! So happy for you!',
  'Happy New Year everyone! 🎊',
  'Merry Christmas 🎄',
  'Happy Diwali! 🪔',
  'Get well soon, take care',
  'RIP 🙏',
  'Sorry for your loss',
  'Miss you guys',
  'Love you all 💕',
  'Long time no see',

  // Forwarded/spam
  'Forwarded from another group',
  '*Forwarded*',
  '🔥 MEGA SALE! 50% off on all items, use code SAVE50',
  'Join my WhatsApp group: wa.me/xyz',
  'Forward this to 10 people for good luck',
  'Share to 5 groups to unlock exclusive content',
  'CONGRATULATIONS! You have won a free iPhone!',
  'Subscribe to our channel for daily updates',
  'Limited time offer! Buy now and save big!',

  // Media/system messages
  '<Media omitted>',
  'Sticker',
  'GIF',
  'Voice message',
  'Missed voice call',
  'Missed video call',
  'Live location shared',
  'This message was deleted',
  'You deleted this message',

  // Very short/meaningless
  '?',
  '!',
  '...',
  'Bruh',
  'Dude',
  'Same',
  'IKR',
  'FR',
  'SMH',
  'TBH',
  'IKR!!',
  'OMG',
  'WTF',
  'Sheesh',
  'No cap',
  'Bet',
  'Facts',
  'Real talk',
  'W',
  'L',

  // Questions that are NOT tasks
  'What does this mean?',
  'Who said that?',
  'Where was this photo taken?',
  'How old is he?',
  'Why did they do that?',
  'Really?',
  'Is that true?',
  'Since when?',
  'How is that possible?',
  'Did you eat?',
  'Are you sleeping?',
  'When did you come back?',
];

// ============================================
// TEMPLATE VARIABLES for realistic variation
// ============================================

const TIMES = ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9:30am', '10:30am', '2:30pm', '4:30pm'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'tomorrow', 'today', 'next week', 'this week'];
const NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Ananya', 'Raj', 'Sara', 'Mike', 'John', 'Lisa', 'David', 'Emily', 'Alex'];
const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'NewYork', 'London', 'Dubai'];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string): string {
  return template
    .replace(/\{time\}/g, randomChoice(TIMES))
    .replace(/\{day\}/g, randomChoice(DAYS))
    .replace(/\{name\}/g, randomChoice(NAMES))
    .replace(/\{city\}/g, randomChoice(CITIES));
}

// ============================================
// TEXT AUGMENTATION — create variations
// ============================================

function augmentText(text: string): string[] {
  const variations: string[] = [text];

  // Lowercase version
  variations.push(text.toLowerCase());

  // Without punctuation
  variations.push(text.replace(/[.!?,;:]/g, ''));

  // Short version (first sentence only)
  const firstSentence = text.split(/[.!?]/)[0];
  if (firstSentence.length >= 10) variations.push(firstSentence);

  // Add common WhatsApp prefixes
  const prefixes = ['Guys ', 'Hey ', 'FYI ', 'Btw ', '@all ', 'Reminder: ', 'Important: ', 'Please note: ', 'Bro ', ''];
  variations.push(randomChoice(prefixes) + text.toLowerCase());

  // Add typos (realistic WhatsApp style)
  if (Math.random() > 0.6) {
    const withTypo = text
      .replace('please', 'pls')
      .replace('Please', 'Pls')
      .replace('tomorrow', 'tmrw')
      .replace('today', 'tdy')
      .replace('meeting', 'mtg')
      .replace('assignment', 'assgn')
      .replace('urgent', 'urgnt')
      .replace('important', 'imp');
    variations.push(withTypo);
  }

  // Add emoji variations
  const emojis = ['🔥', '⚡', '📋', '✅', '📌', '⏰', '💡', '🚀', ''];
  variations.push(text + ' ' + randomChoice(emojis));

  return variations;
}

// ============================================
// MAIN GENERATOR
// ============================================

export function generateTrainingData(samplesPerCategory: number = 500): TrainingExample[] {
  const data: TrainingExample[] = [];

  // Generate WORK examples
  for (let i = 0; i < samplesPerCategory; i++) {
    const template = randomChoice(WORK_TEMPLATES);
    const text = fillTemplate(template);
    const variations = augmentText(text);
    const chosen = randomChoice(variations);

    // Determine priority based on content
    let priority: 'urgent' | 'high' | 'medium' | 'low' = 'medium';
    const lower = chosen.toLowerCase();
    if (/urgent|asap|immediately|emergency|critical|sev1|production.*down|drop everything/i.test(lower)) {
      priority = 'urgent';
    } else if (/deadline|due|by today|by tonight|eod|eow|before/i.test(lower)) {
      priority = 'high';
    } else if (/review|submit|prepare|update|complete|finish/i.test(lower)) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    data.push({ text: chosen, category: 'work', priority });
  }

  // Generate STUDY examples
  for (let i = 0; i < samplesPerCategory; i++) {
    const template = randomChoice(STUDY_TEMPLATES);
    const text = fillTemplate(template);
    const variations = augmentText(text);
    const chosen = randomChoice(variations);

    let priority: 'urgent' | 'high' | 'medium' | 'low' = 'medium';
    const lower = chosen.toLowerCase();
    if (/exam|viva|quiz.*tomorrow|submit.*today|due.*today/i.test(lower)) {
      priority = 'high';
    } else if (/deadline|due|submit|before/i.test(lower)) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    data.push({ text: chosen, category: 'study', priority });
  }

  // Generate PERSONAL examples
  for (let i = 0; i < samplesPerCategory; i++) {
    const template = randomChoice(PERSONAL_TEMPLATES);
    const text = fillTemplate(template);
    const variations = augmentText(text);
    const chosen = randomChoice(variations);

    let priority: 'urgent' | 'high' | 'medium' | 'low' = 'medium';
    const lower = chosen.toLowerCase();
    if (/appointment.*today|flight.*today|emergency|immediately/i.test(lower)) {
      priority = 'high';
    } else if (/appointment|bill|payment|deadline|due/i.test(lower)) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    data.push({ text: chosen, category: 'personal', priority });
  }

  // Generate IGNORE examples (more, because most WhatsApp messages are noise)
  for (let i = 0; i < samplesPerCategory * 1.5; i++) {
    const template = randomChoice(IGNORE_TEMPLATES);
    const text = fillTemplate(template);
    const variations = augmentText(text);
    const chosen = randomChoice(variations);

    data.push({ text: chosen, category: 'ignore', priority: 'low' });
  }

  // Shuffle the data
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }

  return data;
}

/**
 * Split data into training and validation sets
 */
export function splitData(data: TrainingExample[], trainRatio: number = 0.85): {
  train: TrainingExample[];
  validation: TrainingExample[];
} {
  const shuffled = [...data];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const splitIndex = Math.floor(shuffled.length * trainRatio);
  return {
    train: shuffled.slice(0, splitIndex),
    validation: shuffled.slice(splitIndex),
  };
}

export { TrainingExample };
