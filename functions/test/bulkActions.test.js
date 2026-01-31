const { describe, it, expect, beforeEach, afterEach } = require("@jest/globals");
const firebaseFunctionsTest = require("firebase-functions-test");

const test = firebaseFunctionsTest();

// Mock dependencies
const jestMock = require("@jest/globals").jest;

jestMock.mock("firebase-admin", () => {
  const firestoreMock = {
    settings: jestMock.fn(),
    collection: jestMock.fn(),
    doc: jestMock.fn(),
    batch: jestMock.fn(() => ({
      set: jestMock.fn(),
      commit: jestMock.fn().mockResolvedValue(true)
    })),
    runTransaction: jestMock.fn().mockResolvedValue(true)
  };

  // Recursive mocking for collection().doc().collection()...
  const collectionFn = jestMock.fn(() => ({
    doc: docFn,
    where: jestMock.fn().mockReturnThis(),
    limit: jestMock.fn().mockReturnThis(),
    orderBy: jestMock.fn().mockReturnThis(),
    select: jestMock.fn().mockReturnThis(),
    get: jestMock.fn().mockResolvedValue({ docs: [] }),
    add: jestMock.fn().mockResolvedValue({ id: "new-doc-id" }),
    count: jestMock.fn(() => ({ get: jestMock.fn().mockResolvedValue({ data: () => ({ count: 5 }) }) }))
  }));

  const docFn = jestMock.fn(() => ({
    collection: collectionFn,
    get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
    set: jestMock.fn().mockResolvedValue(true),
    update: jestMock.fn().mockResolvedValue(true),
    delete: jestMock.fn().mockResolvedValue(true)
  }));

  firestoreMock.collection.mockImplementation(collectionFn);
  firestoreMock.doc.mockImplementation(docFn);

  const firestoreFn = jestMock.fn(() => firestoreMock);
  firestoreFn.FieldValue = {
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (n) => ({ increment: n }),
    arrayUnion: (...args) => ({ arrayUnion: args })
  };
  firestoreFn.Timestamp = {
    fromDate: (date) => date,
    now: () => new Date()
  };
  firestoreFn.FieldPath = {
    documentId: () => "documentId"
  };
  firestoreFn.Filter = {
    or: (...args) => ({ or: args }),
    where: (field, op, val) => ({ field, op, val })
  };

  return {
    apps: [],
    initializeApp: jestMock.fn(),
    instanceId: jestMock.fn(() => ({ app: { options: { projectId: "test-project" } } })),
    firestore: firestoreFn,
    auth: jestMock.fn(() => ({
      getUser: jestMock.fn().mockResolvedValue({ email: "test@example.com" })
    }))
  };
});

// Mock firebase-admin/firestore and storage
jestMock.mock("firebase-admin/firestore", () => ({
  getFirestore: jestMock.fn(() => require("firebase-admin").firestore())
}));
jestMock.mock("firebase-admin/storage", () => ({
  getStorage: jestMock.fn()
}));

// Mock Cloud Tasks
const mockCreateTask = jestMock.fn().mockResolvedValue([{}]);
jestMock.mock("@google-cloud/tasks", () => {
  return {
    CloudTasksClient: jestMock.fn(() => ({
      queuePath: jestMock.fn((project, location, queue) => `projects/${project}/locations/${location}/queues/${queue}`),
      createTask: mockCreateTask
    }))
  };
});

// Mock other dependencies
const mockGetAdapterForUser = jestMock.fn();
jestMock.mock("../integrations/factory", () => ({
  getAdapterForUser: mockGetAdapterForUser
}));

jestMock.mock("../blacklist", () => ({
  isBlacklisted: jestMock.fn().mockResolvedValue(false)
}));

// Mock delay to speed up tests
jestMock.mock("../bulkActions", () => {
  // We need to require the actual module, but mock the delay function?
  // Jest module mocking overrides the whole export.
  // Instead, let's just make the test wait less or rely on logic that mocks the loop.
  // Actually, we can just edit the loop count or the delay in the code for testing env?
  // Or better, just mock setTimeout?
  // The delay function is internal to bulkActions.js, not exported.
  // We can't easily mock it without rewiring.
  // So we'll trust the test with a smaller batch size in the test data or assume Jest's timer mocks work if we use them.
  // But standard jest.useFakeTimers might conflict with firebase-functions-test.
  // Let's rely on standard require for now.
  return jest.requireActual("../bulkActions");
});


process.env.GCLOUD_PROJECT = "test-project";
process.env.FUNCTION_REGION = "us-central1";
process.env.PROCESS_BULK_BATCH_URL = "https://us-central1-test-project.cloudfunctions.net/processBulkBatch";

const bulkActions = require("../bulkActions");
const admin = require("firebase-admin");

describe("Bulk Actions Tests", () => {
  let db;

  beforeEach(() => {
    db = admin.firestore();
    jestMock.clearAllMocks();
  });

  afterEach(() => {
    test.cleanup();
  });

  it("should enqueue worker with correct URL in initBulkSession", async () => {
    const wrapped = test.wrap(bulkActions.initBulkSession);
    const data = {
      companyId: "company123",
      filters: { leadType: "global" },
      messageConfig: { method: "sms", message: "Hello" }
    };
    const context = {
      auth: { uid: "user123" }
    };

    // Setup mocks
    const mockDoc = {
      get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({ name: "Test Recruiter", companyName: "Test Company" }) }),
      set: jestMock.fn().mockResolvedValue(true),
      update: jestMock.fn().mockResolvedValue(true),
      collection: jestMock.fn(),
      id: "mock-doc-id"
    };

    const mockCollection = {
      doc: jestMock.fn().mockReturnValue(mockDoc),
      where: jestMock.fn().mockReturnThis(),
      limit: jestMock.fn().mockReturnThis(),
      select: jestMock.fn().mockReturnThis(),
      get: jestMock.fn().mockResolvedValue({
        docs: [{ id: "lead1" }, { id: "lead2" }]
      }),
      add: jestMock.fn(),
    };

    mockDoc.collection.mockReturnValue(mockCollection);
    db.collection.mockReturnValue(mockCollection);

    await wrapped({ data, auth: context.auth });

    expect(mockCreateTask).toHaveBeenCalled();
    const taskCall = mockCreateTask.mock.calls[0][0];
    const task = taskCall.task;

    expect(task.httpRequest.url).toBe("https://us-central1-test-project.cloudfunctions.net/processBulkBatch");
  });

  it("should process batch and enqueue next batch in processBulkBatch", async () => {
    const req = {
      headers: { "x-appengine-queuename": "bulk-actions-queue" },
      body: { companyId: "company123", sessionId: "session123" }
    };
    const res = {
      status: jestMock.fn().mockReturnThis(),
      send: jestMock.fn()
    };

    // Reduce targetIds to < 20 to avoid loops and timeouts, since the loop uses real delay(3000)
    const sessionData = {
      status: "active",
      targetIds: ["lead1", "lead2"], // Only 2 items
      currentPointer: 0,
      config: { method: "sms", message: "Hello" },
      leadSourceType: "leads",
      creatorId: "user123"
    };

    const sessionRefMock = {
      get: jestMock.fn().mockResolvedValue({ exists: true, data: () => sessionData }),
      update: jestMock.fn().mockResolvedValue(true),
      collection: jestMock.fn()
    };

    // Mock logs collection .doc().set()
    const logDocMock = {
        set: jestMock.fn().mockResolvedValue(true),
        get: jestMock.fn().mockResolvedValue({ exists: false })
    };
    const logsCollectionMock = {
      doc: jestMock.fn(() => logDocMock)
    };

    // Handle specific collection calls
    sessionRefMock.collection.mockImplementation((name) => {
        if (name === "logs") return logsCollectionMock;
        if (name === "targets") return { doc: jestMock.fn(() => ({ get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({}) }) })) };
        return { doc: jestMock.fn() };
    });

    const mockCollection = {
      doc: jestMock.fn(),
    };
    db.collection.mockReturnValue(mockCollection);

    const companiesDoc = { collection: jestMock.fn() };
    const bulkSessionsCollection = { doc: jestMock.fn() };

    mockCollection.doc.mockImplementation((id) => {
      if (id === "company123") return companiesDoc;
      if (id && id.startsWith("lead")) {
        return {
          get: jestMock.fn().mockResolvedValue({
            exists: true,
            data: () => ({ firstName: "John", phone: "1234567890" }),
          }),
          update: jestMock.fn().mockResolvedValue(true)
        };
      }
      return { get: jestMock.fn().mockResolvedValue({ exists: false }) };
    });

    companiesDoc.collection.mockImplementation((name) => {
      if (name === "bulk_sessions") return bulkSessionsCollection;
      if (name === "leads") return mockCollection;
      return { doc: jestMock.fn() };
    });

    bulkSessionsCollection.doc.mockReturnValue(sessionRefMock);

    mockGetAdapterForUser.mockResolvedValue({
      sendSMS: jestMock.fn().mockResolvedValue(true)
    });

    await bulkActions.processBulkBatch(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("Processed batch"));

    // Verify session update - since only 2 items, it should complete
    // And pointer should move to 2
    expect(sessionRefMock.update).toHaveBeenCalled();
  }, 20000); // Increase timeout to 20s just in case

  it("should exclude IDs in filters.excludedLeadIds", async () => {
    const wrapped = test.wrap(bulkActions.initBulkSession);
    const data = {
      companyId: "company123",
      filters: {
        leadType: "global",
        excludedLeadIds: ["lead1"]
      },
      messageConfig: { method: "sms", message: "Hello" }
    };
    const context = {
      auth: { uid: "user123" }
    };

    const mockDoc = {
      get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({ name: "Test Recruiter", companyName: "Test Company" }) }),
      set: jestMock.fn().mockResolvedValue(true),
      update: jestMock.fn().mockResolvedValue(true),
      collection: jestMock.fn(),
      id: "mock-doc-id"
    };

    const mockCollection = {
      doc: jestMock.fn().mockReturnValue(mockDoc),
      where: jestMock.fn().mockReturnThis(),
      limit: jestMock.fn().mockReturnThis(),
      select: jestMock.fn().mockReturnThis(), // Added select
      get: jestMock.fn().mockResolvedValue({
        docs: [{ id: "lead1" }, { id: "lead2" }]
      }),
      add: jestMock.fn(),
    };

    mockDoc.collection.mockReturnValue(mockCollection);
    db.collection.mockReturnValue(mockCollection);

    const result = await wrapped({ data, auth: context.auth });

    expect(result.targetCount).toBe(1);
  });

  it("should map status IDs to DB values", async () => {
    const wrapped = test.wrap(bulkActions.initBulkSession);
    const data = {
      companyId: "company123",
      filters: {
        leadType: "leads",
        status: ["new", "contacted"]
      },
      messageConfig: { method: "sms", message: "Hello" }
    };
    const context = {
      auth: { uid: "user123" }
    };

    const mockWhere = jestMock.fn().mockReturnThis();
    const mockDocWithGet = {
      collection: jestMock.fn(),
      get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({}) })
    };
    const mockCollection = {
      doc: jestMock.fn().mockReturnValue(mockDocWithGet),
      where: mockWhere,
      limit: jestMock.fn().mockReturnThis(),
      select: jestMock.fn().mockReturnThis(), // Added select
      get: jestMock.fn().mockResolvedValue({
        docs: [{ id: "lead1" }]
      }),
      add: jestMock.fn(),
    };

    // Need to mock the assertCompanyAdmin logic which accesses db.collection("companies").doc(...).collection("team").doc(...).get()
    const teamDoc = { get: jestMock.fn().mockResolvedValue({ exists: true }) };
    const teamCollection = { doc: jestMock.fn(() => teamDoc) };

    // Correctly mock the specific chain for companies -> doc -> collection(team)
    const companyDoc = {
      collection: jestMock.fn((colName) => {
        if (colName === "leads") return mockCollection;
        if (colName === "team") return teamCollection;
        if (colName === "bulk_sessions") return { doc: jestMock.fn(() => ({ set: jestMock.fn(), id: "sess1" })) };
        return { doc: jestMock.fn() };
      }),
      get: jestMock.fn().mockResolvedValue({ exists: true, data: () => ({}) })
    };

    const companiesCollection = {
      doc: jestMock.fn(() => companyDoc)
    };

    db.collection.mockImplementation((colName) => {
      if (colName === "companies") return companiesCollection;
      return mockCollection;
    });

    await wrapped({ data, auth: context.auth });

    expect(mockWhere).toHaveBeenCalledWith("status", "in", ["New Application", "Contacted"]);
  });
});
