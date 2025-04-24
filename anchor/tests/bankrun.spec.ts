import {GetVersionedTransactionConfig, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from '@coral-xyz/anchor';
import { BanksClient, Clock, ProgramTestContext, startAnchor } from "solana-bankrun";
import IDL from "../target/idl/tokenvesting.json";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";
import { BankrunProvider } from "anchor-bankrun";
import {Program} from "@coral-xyz/anchor";
import {Tokenvesting} from "../target/types/tokenvesting";
import { createMint, mintTo } from "spl-token-bankrun";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
describe("Vesting Smart Contract Tests", () =>{
    const companyName = "companyName";
    let beneficiary: Keypair;
    let context: ProgramTestContext;
    let provider: BankrunProvider;
    let program: Program<Tokenvesting>;
    let banksClient: BanksClient;
    let employer: Keypair;
    let mint: PublicKey;
    let beneficiaryProvider: BankrunProvider;
    let program2: Program<Tokenvesting>;
    let vestingAccountKey: PublicKey;
    let treasuryTokenAccount: PublicKey;
    let employeeAccount: PublicKey;


    beforeAll(async () =>{
        beneficiary = new anchor.web3.Keypair();
        context = await startAnchor(
            '',
            [{name: "tokenvesting", programId: new PublicKey(IDL.address)}, ],
            [
                {
                    address: beneficiary.publicKey,
                    info: {
                        lamports: 1_000_000_000,
                        data: Buffer.alloc(0),
                        owner: SYSTEM_PROGRAM_ID,
                        executable: false,
                    },
                },
            ]
        );

        provider = new BankrunProvider(context);

        anchor.setProvider(provider);

        program = new Program<Tokenvesting>(IDL as Tokenvesting, provider);

        banksClient = context.banksClient;

        employer = provider.wallet.payer;
        
        mint = await createMint(banksClient, employer, employer.publicKey, null, 2);

        beneficiaryProvider = new BankrunProvider(context);
        beneficiaryProvider.wallet = new NodeWallet(beneficiary);

        program2 = new Program<Tokenvesting>(IDL as Tokenvesting, beneficiaryProvider);

        [vestingAccountKey] = PublicKey.findProgramAddressSync(
            [Buffer.from(companyName)],
            program.programId
        );

        [treasuryTokenAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from('vesting_treasury'), Buffer.from(companyName)],
                program.programId
        );

         [employeeAccount] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('employee_vesting'),
                beneficiary.publicKey.toBuffer(),
                vestingAccountKey.toBuffer(),
            ],
            program.programId
         );
    });

    it('Should create a vesting account', async () =>{
        const tx = await program.methods.createVestingAccount(companyName)
        .accounts({
            signer: employer.publicKey,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc({commitment: 'confirmed'});

        const vestingAccountData = await program.account.vestingAccount.fetch(
            vestingAccountKey,
            'confirmed',
        );

        console.log("Created Vesting Account: ", vestingAccountData);
    });

    it("should fund the treasury token account", async () =>{
        const amount = 10_000 * 10 ** 9;
        const mintTx = await mintTo(
            banksClient,
            employer,
            mint,
            treasuryTokenAccount,
            employer,
            amount
        );
        console.log('Mint Treasury Token Account: ', mintTx);
    });

    it("Should create Employee Vesting Account", async () =>{
        const tx2 = await program.methods.createEmployeeAccount(
            new BN(0),
            new BN(100),
            new BN(100),
            new BN(0),
        ).accounts({
            beneficiary: beneficiary.publicKey,
            vestingAccount: vestingAccountKey,
        }).rpc({commitment: 'confirmed', skipPreflight: true});

        console.log("Create Employee Account Tx: ", tx2);
        console.log("Employee Account: ", employeeAccount.toBase58());
    });

    
        it("Should Claim The Employees Vested Tokens", async () =>{
            await new Promise((resolve)=> setTimeout(resolve,1000));
            const currentClock = await banksClient.getClock();
            context.setClock(
                new Clock(
                    currentClock.slot,
                    currentClock.epochStartTimestamp,
                    currentClock.epoch,
                    currentClock.leaderScheduleEpoch,
                    BigInt(1000)
            ));
            const [employeeTokenAccount] = PublicKey.findProgramAddressSync(
                [
                    beneficiary.publicKey.toBuffer(),
                    TOKEN_PROGRAM_ID.toBuffer(),
                    mint.toBuffer(),
                ],
                new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program ID
            );
            try {
                const tx3 = await program2.methods.claimTokens(companyName)
                .accounts({ tokenProgram: TOKEN_PROGRAM_ID })
                .rpc({commitment: 'confirmed'}); // transaction()).serialize({requireAllSignatures: false, verifySignatures: false})
                
                console.log("Claim Tokens Tx: ", tx3);
            
    } catch (error) {
        console.log("Error while Claiming Tokens by Employee: ", error);
    }
});
});