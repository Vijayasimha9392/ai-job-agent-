// =====================================================================
// Candidate Matching Profile & Search Rules Configuration
// =====================================================================

const candidateProfile = {
  name: "Vijayasimha Tammineni",
  title: "Java Full Stack Developer",
  experienceMonths: 8,
  experienceYearsRange: "0-2 years (Early Career / Fresher)",
  education: {
    degree: "Bachelor of Technology in Computer Science and Engineering",
    university: "Malla Reddy University, Hyderabad, India",
    graduationPeriod: "September 2021 – May 2025",
    graduationYear: 2025,
    eligibleForFresherRoles: true
  },
  workExperience: [
    {
      company: "Virinchi Ltd",
      role: "Trainee Developer",
      period: "September 2025 – May 2026",
      project: "V23 – Healthcare Platform",
      highlights: [
        "Developed and maintained 15+ RESTful APIs using Java and Spring Boot (authentication, provider verification, approval workflows)",
        "Designed backend modules and database schemas for healthcare workflows using MySQL and JDBC",
        "Enhanced complex MySQL queries and JDBC operations with indexing, achieving 20% faster response times",
        "Integrated React.js frontend components with Spring Boot REST APIs",
        "Tested, debugged, and troubleshot REST APIs using Postman and collaborated in Agile sprint teams with Git"
      ]
    }
  ],
  projects: [
    {
      name: "Event Booking and Management System",
      techStack: "Java, Spring Boot, MySQL, React.js, REST APIs",
      highlights: [
        "Engineered automated event scheduling, booking, and payment processing REST APIs",
        "Normalized MySQL schemas, pagination, and filtering (reducing payload size by 40%)",
        "Average API latency below 300ms"
      ]
    }
  ],
  primarySkills: [
    "Java",
    "Core Java",
    "Spring Boot",
    "Spring MVC",
    "REST APIs",
    "JPA",
    "JDBC",
    "React.js",
    "JavaScript",
    "HTML5",
    "CSS3",
    "MySQL",
    "SQL",
    "Maven",
    "Postman",
    "Git",
    "GitHub",
    "Agile",
    "Scrum",
    "SDLC"
  ],
  secondarySkills: [
    "Microservices",
    "Hibernate",
    "VS Code",
    "Eclipse",
    "Debugging",
    "Database Indexing",
    "Backend Development",
    "Full Stack Development"
  ],
  incompatibleFrameworks: [
    "Angular",
    "Vue.js",
    "Django",
    "Flask",
    "ASP.NET",
    ".NET",
    "PHP",
    "Ruby on Rails"
  ],
  targetRoles: [
    "Software Engineer",
    "Software Developer",
    "Associate Software Engineer",
    "Associate Software Developer",
    "Junior Software Engineer",
    "Junior Software Developer",
    "Java Developer",
    "Junior Java Developer",
    "Java Software Engineer",
    "Java Backend Developer",
    "Backend Developer",
    "Backend Engineer",
    "Spring Boot Developer",
    "Java Spring Boot Developer",
    "Full Stack Developer",
    "Java Full Stack Developer",
    "Full Stack Engineer",
    "Application Developer",
    "Application Engineer",
    "Graduate Engineer Trainee",
    "Graduate Software Engineer",
    "Trainee Software Engineer",
    "Trainee Developer",
    "Technology Analyst - Entry Level",
    "Programmer Analyst - Entry Level",
    "Associate Engineer",
    "Software Engineer I",
    "Developer I",
    "SDE I",
    "Entry-Level Software Developer"
  ],
  targetLocations: [
    "Hyderabad",
    "Bengaluru",
    "Bangalore",
    "Chennai",
    "Pune",
    "Mumbai",
    "Remote",
    "Remote India",
    "PAN India",
    "Noida",
    "Gurugram",
    "Gurgaon",
    "Delhi NCR",
    "Kochi",
    "Coimbatore",
    "Ahmedabad"
  ],
  scoringWeights: {
    technicalSkills: 0.35,
    experienceEligibility: 0.20,
    roleMatch: 0.15,
    freshness: 0.15,
    locationMatch: 0.10,
    educationEligibility: 0.05
  },
  skillPoints: {
    "java": 12,
    "spring boot": 12,
    "react": 10,
    "mysql": 8,
    "rest api": 8,
    "spring mvc": 6,
    "jpa": 6,
    "jdbc": 6,
    "sql": 6,
    "javascript": 5,
    "maven": 4,
    "postman": 4,
    "git": 4,
    "html": 3,
    "css": 3
  },
  searchQueries: [
    "Java Full Stack Developer fresher India",
    "Java React Developer 0-2 years India",
    "Spring Boot React Developer India",
    "Associate Software Engineer Java India",
    "Java Developer fresher Hyderabad",
    "Java Backend Developer junior India",
    "Junior Java Full Stack Developer Bangalore",
    "Software Engineer Java React 0-2 years",
    "Graduate Software Engineer Java India",
    "Trainee Software Engineer Java India",
    "Java Spring Boot Developer Pune",
    "Associate Software Developer Java Chennai",
    "Java Full Stack Developer Remote India"
  ]
};

module.exports = candidateProfile;
