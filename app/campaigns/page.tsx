import Header from "../components/Header";
import styles from "./campaigns.module.css";

export default function Campaigns() {
  return (
    <main>
      <Header active="campaigns" />

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>WhatsApp marketing</div>
          <h1>Send a campaign</h1>
          <p>
            Select the customer group, preview every recipient, then send only
            when the list looks right.
          </p>
        </div>
        <div className={styles.safetyNote}>
          <strong>Safe by default</strong>
          <span>Paid orders only · duplicates removed · opt-outs excluded</span>
        </div>
      </section>

      <form
        action="/api/campaigns/preview"
        method="post"
        encType="multipart/form-data"
        className={styles.form}
      >
        <section className={styles.section}>
          <div className={styles.stepNumber}>1</div>
          <div className={styles.sectionBody}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Choose customers</h2>
                <p>Trial Pack buyers are selected from actual paid orders.</p>
              </div>
              <span className={styles.recommended}>Recommended</span>
            </div>

            <label className={styles.field}>
              <span>Customer group</span>
              <select name="audience_source" defaultValue="trial_pack_buyers">
                <option value="trial_pack_buyers">Trial Pack buyers</option>
                <option value="crm">All CRM customers</option>
              </select>
              <small>
                No file is needed. Leave CSV upload blank when using this group.
              </small>
            </label>

            <details className={styles.optionalPanel}>
              <summary>Use a CSV instead</summary>
              <div className={styles.optionalContent}>
                <p>
                  Only upload a file when you already have a separate customer
                  list. A CSV overrides the customer group selected above.
                </p>
                <label className={styles.field}>
                  <span>Audience CSV</span>
                  <input name="audience_file" type="file" accept=".csv" />
                  <small>Expected columns: name, phone, product, city.</small>
                </label>
              </div>
            </details>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.stepNumber}>2</div>
          <div className={styles.sectionBody}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Campaign message</h2>
                <p>Use a template that is already approved in Meta.</p>
              </div>
            </div>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Campaign name</span>
                <input
                  name="campaign_name"
                  defaultValue="Trial Pack Customer Campaign"
                  placeholder="Internal campaign name"
                  required
                />
              </label>

              <label className={styles.field}>
                <span>Approved template name</span>
                <input
                  name="template_name"
                  defaultValue="arctic_waves_promotion"
                  placeholder="Meta template name"
                  required
                />
              </label>
            </div>

            <details className={styles.optionalPanel}>
              <summary>Optional header image</summary>
              <div className={styles.optionalContent}>
                <label className={styles.field}>
                  <span>Public image URL</span>
                  <input
                    name="header_image_url"
                    defaultValue="https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/DESERT_TONKA_PROMOTION.png"
                    placeholder="https://..."
                    type="url"
                  />
                </label>
              </div>
            </details>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.stepNumber}>3</div>
          <div className={styles.sectionBody}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Preview safely</h2>
                <p>Start with 3–5 customers and verify the list before sending.</p>
              </div>
            </div>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Preview limit</span>
                <input name="limit" type="number" defaultValue="3" min="1" max="500" />
              </label>

              <label className={styles.field}>
                <span>Admin password</span>
                <input
                  name="admin_password"
                  placeholder="Required to create the preview"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
            </div>

            <button className={styles.submitButton} type="submit">
              Preview selected customers
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </form>
    </main>
  );
}
