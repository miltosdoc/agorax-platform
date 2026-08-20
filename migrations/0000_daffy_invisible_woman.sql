CREATE TABLE "account_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_fingerprint" text,
	"ip_address" text,
	"action" text NOT NULL,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"voter_hash" text NOT NULL,
	"file_hash" text NOT NULL,
	"vote_choice" text NOT NULL,
	"signer_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ballot_votes_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'autonomous' NOT NULL,
	"governance_model" text DEFAULT 'no_admin',
	"creator_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"max_concurrent_votes" integer DEFAULT -1,
	"min_participation_pct" numeric DEFAULT '0',
	"sortition_size" integer DEFAULT 20,
	"sortition_mode" text DEFAULT 'absolute',
	"sortition_response_hours" integer DEFAULT 72,
	"require_govgr_verification" boolean DEFAULT false,
	"democracy_score" numeric
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debate_arguments" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"side" text NOT NULL,
	"text" text NOT NULL,
	"support_count" integer DEFAULT 0,
	"opposition_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"creator_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"text" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"poll_id" integer NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"text" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"text" text NOT NULL,
	"question_type" text NOT NULL,
	"order" integer NOT NULL,
	"parent_id" integer,
	"parent_answer_id" integer,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_user_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"answer_id" integer,
	"answer_value" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"creator_id" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"allow_extension" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"show_results" boolean DEFAULT false NOT NULL,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"require_verification" boolean DEFAULT false NOT NULL,
	"poll_type" text DEFAULT 'singleChoice' NOT NULL,
	"location_scope" text DEFAULT 'global' NOT NULL,
	"community_mode" boolean DEFAULT false NOT NULL,
	"center_lat" text,
	"center_lng" text,
	"radius_km" integer,
	"city" text,
	"region" text,
	"country" text,
	"location_city" text,
	"location_region" text,
	"location_country" text,
	"location_city_id" text,
	"location_region_id" text,
	"location_country_id" text,
	"geo_region" text,
	"group_id" integer
);
--> statement-breakpoint
CREATE TABLE "proposal_amendments" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending',
	"author_veto" boolean DEFAULT false,
	"llm_score" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_support" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"question" text NOT NULL,
	"solution" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"llm_score" numeric,
	"llm_feedback" text,
	"llm_validated_at" timestamp,
	"llm_validation_round" integer DEFAULT 1,
	"sortition_avg_score" numeric,
	"sortition_rank" integer,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sortition_bodies" (
	"id" serial PRIMARY KEY NOT NULL,
	"community_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"proposal_id" integer,
	"size" integer NOT NULL,
	"response_hours" integer DEFAULT 72,
	"status" text DEFAULT 'selecting',
	"selected_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sortition_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"body_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"responded" boolean DEFAULT false,
	"score" numeric,
	"scored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"provider_id" text,
	"provider" text,
	"profile_picture" text,
	"latitude" text,
	"longitude" text,
	"location_confirmed" boolean DEFAULT false,
	"location_verified" boolean DEFAULT false,
	"is_admin" boolean DEFAULT false NOT NULL,
	"device_fingerprint" text,
	"registration_ip" text,
	"last_login_ip" text,
	"account_flags" jsonb,
	"account_status" text DEFAULT 'active',
	"govgr_verified" boolean DEFAULT false,
	"govgr_verified_at" timestamp,
	"govgr_voter_hash" text,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"option_id" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_activity" ADD CONSTRAINT "account_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_votes" ADD CONSTRAINT "ballot_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debate_arguments" ADD CONSTRAINT "debate_arguments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debate_arguments" ADD CONSTRAINT "debate_arguments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_question_id_poll_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."poll_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_notifications" ADD CONSTRAINT "poll_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_notifications" ADD CONSTRAINT "poll_notifications_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_questions" ADD CONSTRAINT "poll_questions_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_user_responses" ADD CONSTRAINT "poll_user_responses_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_user_responses" ADD CONSTRAINT "poll_user_responses_question_id_poll_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."poll_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_user_responses" ADD CONSTRAINT "poll_user_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_user_responses" ADD CONSTRAINT "poll_user_responses_answer_id_poll_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."poll_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_amendments" ADD CONSTRAINT "proposal_amendments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_amendments" ADD CONSTRAINT "proposal_amendments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_support" ADD CONSTRAINT "proposal_support_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_support" ADD CONSTRAINT "proposal_support_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sortition_bodies" ADD CONSTRAINT "sortition_bodies_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sortition_bodies" ADD CONSTRAINT "sortition_bodies_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sortition_members" ADD CONSTRAINT "sortition_members_body_id_sortition_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."sortition_bodies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sortition_members" ADD CONSTRAINT "sortition_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ballot_poll_voter_unique" ON "ballot_votes" USING btree ("poll_id","voter_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "community_member_unique" ON "community_members" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_member_unique" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_notification_unique" ON "poll_notifications" USING btree ("user_id","poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_support_unique" ON "proposal_support" USING btree ("proposal_id","user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "sortition_member_unique" ON "sortition_members" USING btree ("body_id","user_id");