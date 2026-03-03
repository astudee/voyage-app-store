-- Create VC_PHONE_DIRECTORY table and seed with current data
-- Run via Snowflake console or snowflake-sdk

CREATE TABLE IF NOT EXISTS VC_PHONE_DIRECTORY (
  DIRECTORY_ID NUMBER(38,0) AUTOINCREMENT PRIMARY KEY,
  EXTENSION VARCHAR(10) NOT NULL,
  FIRST_NAME VARCHAR(100) NOT NULL,
  LAST_NAME VARCHAR(100) NOT NULL,
  TITLE VARCHAR(200),
  PHONE_NUMBER VARCHAR(20) NOT NULL,
  ALIASES VARCHAR(500),
  IS_ACTIVE BOOLEAN DEFAULT TRUE,
  CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Seed data from phone-config.ts
INSERT INTO VC_PHONE_DIRECTORY (EXTENSION, FIRST_NAME, LAST_NAME, TITLE, PHONE_NUMBER, ALIASES) VALUES
('501', 'Andrew', 'Studee', 'Managing Director', '+13122120815', NULL),
('502', 'Emily', 'Minton', 'Director', '+13153726406', NULL),
('503', 'David', 'Woods', 'Director', '+19206916440', NULL),
('504', 'Harry', 'Marsteller', 'Director', '+14104598486', NULL),
('505', 'Karen', 'Gliwa', 'Director', '+13129538653', NULL),
('506', 'John', 'Adelphia', 'Consultant', '+17733433915', NULL),
('507', 'Steve', 'Campbell', 'Senior Consultant', '+17038680095', NULL),
('508', 'Derrick', 'Chin', 'Senior Consultant', '+17037328142', NULL),
('509', 'Peter', 'Croswell', 'Senior Consultant', '+15023209055', NULL),
('510', 'Charlie', 'Danoff', 'Associate Consultant', '+17735406095', NULL),
('511', 'Olivia', 'Dodds', 'Associate', '+17123440077', NULL),
('512', 'Jamar', 'Freeze', 'Consultant', '+16465964715', NULL),
('513', 'Kiki', 'Hager', 'Associate', '+18168049418', NULL),
('514', 'Jill', 'Hanson', 'Senior Consultant', '+16086286037', NULL),
('515', 'Bryan', 'Hayden', 'Sales Director', '+17057944396', NULL),
('516', 'Jacob', 'Heiss', 'Knowledge & Marketing Associate', '+17733698311', NULL),
('517', 'Greg', 'Jacobson', 'Senior Advisor', '+14105998395', NULL),
('518', 'Terrence', 'Jefferson', 'Associate Consultant', '+13012418592', NULL),
('519', 'Roger', 'LaGrone', 'Senior Consultant', '+16312366397', NULL),
('520', 'Kevin', 'Moos', 'Senior Advisor', '+16507992962', NULL),
('521', 'Nora', 'Naughton', 'Associate Consultant', '+13128134405', NULL),
('522', 'Luke', 'Puchalski', 'Consultant', '+12146818498', NULL),
('523', 'Sarah', 'Rivard', 'Assistant', '+18155733919', NULL),
('524', 'Jerrod', 'Rogers', 'Director', '+19203273325', NULL),
('525', 'Traci', 'Stanek', 'Recruiter', '+16085168969', NULL),
('526', 'Emma', 'Sweeney', 'Project Coordinator / Admin Asst', '+12404401901', NULL),
('527', 'Sarah', 'Taylor', 'Associate Consultant', '+17173640022', NULL),
('528', 'Randy/Holly', 'Tran', 'Associate Consultant', '+14252086368', 'Randy,Holly'),
('529', 'Sophia', 'Valbuena', 'Senior Consultant', '+13125816022', NULL),
('530', 'Harry', 'Waldron', 'Associate Consultant', '+15405214223', NULL);
