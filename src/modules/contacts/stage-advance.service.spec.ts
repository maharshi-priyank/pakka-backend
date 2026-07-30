import { Test, TestingModule } from '@nestjs/testing';
import { StageAdvanceService } from './stage-advance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Manual PrismaService mock — this repo has no existing PrismaService test
// mock precedent (see plan KTD11), so each method used by the code under
// test gets a plain jest.fn().
function createMockPrisma() {
  return {
    contract: {
      findUnique: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      count:      jest.fn(),
      update:     jest.fn(),
    },
  };
}

describe('StageAdvanceService', () => {
  let service: StageAdvanceService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageAdvanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<StageAdvanceService>(StageAdvanceService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('contract.voided', () => {
    it('regresses a CLIENT-stage Contact to LOST when its signed Contract is voided', async () => {
      prisma.contract.findUnique.mockResolvedValue({ contactId: 'contact-1' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'CLIENT', archivedAt: null });

      await service.onContractVoided({ entityId: 'contract-1', workspaceId: 'ws-1' });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data:  expect.objectContaining({ stage: 'LOST' }),
      });
    });

    it('does not throw when the voided Contract has no linked Contact', async () => {
      prisma.contract.findUnique.mockResolvedValue({ contactId: null });

      await expect(
        service.onContractVoided({ entityId: 'contract-2', workspaceId: 'ws-1' }),
      ).resolves.not.toThrow();

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('does nothing when the Contact is below CLIENT stage', async () => {
      prisma.contract.findUnique.mockResolvedValue({ contactId: 'contact-3' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'NEGOTIATING', archivedAt: null });

      await service.onContractVoided({ entityId: 'contract-3', workspaceId: 'ws-1' });

      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('does nothing when the Contact is archived', async () => {
      prisma.contract.findUnique.mockResolvedValue({ contactId: 'contact-4' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'CLIENT', archivedAt: new Date() });

      await service.onContractVoided({ entityId: 'contract-4', workspaceId: 'ws-1' });

      expect(prisma.contact.update).not.toHaveBeenCalled();
    });
  });

  describe('project.cancelled', () => {
    it('keeps the Contact at CLIENT when one Project is CANCELLED (via status) but another is ACTIVE (via projectStage)', async () => {
      prisma.project.findUnique.mockResolvedValue({ contactId: 'contact-5' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'CLIENT', archivedAt: null });
      // One Project (the ACTIVE one) is still "not cancelled by either field".
      prisma.project.count
        .mockResolvedValueOnce(1) // activeProjectCount
        .mockResolvedValueOnce(2); // totalProjectCount

      await service.onProjectCancelled({ entityId: 'project-cancelled-1', workspaceId: 'ws-1' });

      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('regresses the Contact to LOST when all Projects end up cancelled (one via status, one via projectStage)', async () => {
      prisma.project.findUnique.mockResolvedValue({ contactId: 'contact-6' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'CLIENT', archivedAt: null });
      prisma.project.count
        .mockResolvedValueOnce(0) // activeProjectCount — none left uncancelled
        .mockResolvedValueOnce(2); // totalProjectCount

      await service.onProjectCancelled({ entityId: 'project-cancelled-2', workspaceId: 'ws-1' });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-6' },
        data:  expect.objectContaining({ stage: 'LOST' }),
      });
    });

    it('never regresses a Contact with zero Projects, even if the counts would otherwise imply "all cancelled" (KTD4)', async () => {
      prisma.project.findUnique.mockResolvedValue({ contactId: 'contact-7' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'CLIENT', archivedAt: null });
      prisma.project.count
        .mockResolvedValueOnce(0) // activeProjectCount
        .mockResolvedValueOnce(0); // totalProjectCount — vacuous case

      await service.onProjectCancelled({ entityId: 'project-cancelled-3', workspaceId: 'ws-1' });

      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('does not attempt regression when the Contact is below CLIENT stage, even if all its Projects become cancelled', async () => {
      prisma.project.findUnique.mockResolvedValue({ contactId: 'contact-8' });
      prisma.contact.findUnique.mockResolvedValue({ stage: 'NEGOTIATING', archivedAt: null });

      await service.onProjectCancelled({ entityId: 'project-cancelled-4', workspaceId: 'ws-1' });

      // The stage check happens before the aggregate count query.
      expect(prisma.project.count).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('does nothing when the cancelled Project has no linked Contact', async () => {
      prisma.project.findUnique.mockResolvedValue({ contactId: null });

      await expect(
        service.onProjectCancelled({ entityId: 'project-cancelled-5', workspaceId: 'ws-1' }),
      ).resolves.not.toThrow();

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });
  });
});

describe('ProjectsService — project.cancelled emission guard', () => {
  let service: ProjectsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => jest.clearAllMocks());

  function mockFindOne(project: { status: string; projectStage: string | null }) {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-1', ...project });
  }

  it('emits project.cancelled on a genuine transition into CANCELLED', async () => {
    mockFindOne({ status: 'ACTIVE', projectStage: null });
    prisma.project.update.mockResolvedValue({ id: 'project-1', status: 'CANCELLED', projectStage: null });

    await service.update('ws-1', 'project-1', { status: 'CANCELLED' as never });

    expect(eventEmitter.emit).toHaveBeenCalledWith('project.cancelled', {
      entityId:    'project-1',
      workspaceId: 'ws-1',
    });
  });

  it('does not re-emit when the Project moves ACTIVE -> ACTIVE (no transition into CANCELLED)', async () => {
    mockFindOne({ status: 'ACTIVE', projectStage: null });
    prisma.project.update.mockResolvedValue({ id: 'project-1', status: 'ACTIVE', projectStage: null });

    await service.update('ws-1', 'project-1', { status: 'ACTIVE' as never });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not re-emit when the Project moves CANCELLED -> CANCELLED (already cancelled, no genuine transition)', async () => {
    mockFindOne({ status: 'CANCELLED', projectStage: null });
    prisma.project.update.mockResolvedValue({ id: 'project-1', status: 'CANCELLED', projectStage: null });

    await service.update('ws-1', 'project-1', { status: 'CANCELLED' as never });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('emits again after a CANCELLED -> ACTIVE -> CANCELLED cycle, once per genuine transition', async () => {
    // Step 1: CANCELLED -> ACTIVE
    mockFindOne({ status: 'CANCELLED', projectStage: null });
    prisma.project.update.mockResolvedValueOnce({ id: 'project-1', status: 'ACTIVE', projectStage: null });
    await service.update('ws-1', 'project-1', { status: 'ACTIVE' as never });
    expect(eventEmitter.emit).not.toHaveBeenCalled();

    // Step 2: ACTIVE -> CANCELLED again
    mockFindOne({ status: 'ACTIVE', projectStage: null });
    prisma.project.update.mockResolvedValueOnce({ id: 'project-1', status: 'CANCELLED', projectStage: null });
    await service.update('ws-1', 'project-1', { status: 'CANCELLED' as never });

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('project.cancelled', {
      entityId:    'project-1',
      workspaceId: 'ws-1',
    });
  });

  it('does not emit when the Project was already cancelled via the other field (projectStage)', async () => {
    mockFindOne({ status: 'ACTIVE', projectStage: 'CANCELLED' });
    prisma.project.update.mockResolvedValue({ id: 'project-1', status: 'CANCELLED', projectStage: 'CANCELLED' });

    await service.update('ws-1', 'project-1', { status: 'CANCELLED' as never });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
